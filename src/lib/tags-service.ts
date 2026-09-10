import { createAdminClient } from '@/lib/supabase/admin'
import { verifySuperadmin, verifyTenantPermission } from '@/lib/admin-service'
import type { TagDefinition } from '@/types/database'

export async function getTagDefinitions(tenantId: string): Promise<TagDefinition[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tag_definitions')
    .select('*')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order('group_name')
    .order('tag_value')
  if (error) { console.error('Error fetching tag definitions:', error); return [] }
  return (data || []) as TagDefinition[]
}

export async function getPresetTags(): Promise<TagDefinition[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tag_definitions')
    .select('*')
    .is('tenant_id', null)
    .order('group_name')
    .order('tag_value')
  if (error) { console.error('Error fetching preset tags:', error); return [] }
  return (data || []) as TagDefinition[]
}

export async function createTagDefinition(tenantId: string, groupName: string, tagValue: string): Promise<TagDefinition> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tag_definitions')
    .insert({ tenant_id: tenantId, group_name: groupName.trim(), tag_value: tagValue.trim().toLowerCase(), is_preset: false })
    .select()
    .single()
  if (error) throw error
  return data as TagDefinition
}

// Preset tags have no tenant: they are the list every store's editor renders,
// so only the platform may change them.
export async function createPresetTag(groupName: string, tagValue: string): Promise<TagDefinition> {
  await verifySuperadmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tag_definitions')
    .insert({ tenant_id: null, group_name: groupName.trim(), tag_value: tagValue.trim().toLowerCase(), is_preset: true })
    .select()
    .single()
  if (error) throw error
  return data as TagDefinition
}

export async function deleteTagDefinition(id: string, tenantId: string): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tag_definitions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('is_preset', false)
  if (error) throw error
}

export async function deletePresetTag(id: string): Promise<void> {
  await verifySuperadmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tag_definitions')
    .delete()
    .eq('id', id)
    .is('tenant_id', null)
  if (error) throw error
}

export async function getItemTagIds(itemId: string, tenantId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('menu_item_tags')
    .select('tag_definition_id')
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)
  if (error) { console.error('Error fetching item tags:', error); return [] }
  return (data || []).map((row: { tag_definition_id: string }) => row.tag_definition_id)
}

export async function getItemTags(itemId: string, tenantId: string): Promise<TagDefinition[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('menu_item_tags')
    .select('tag_definition:tag_definitions!tag_definition_id(*)')
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)
  if (error) { console.error('Error fetching item tags:', error); return [] }
  return (data || []).map((row: Record<string, unknown>) => row.tag_definition as TagDefinition)
}

export async function setItemTags(itemId: string, tenantId: string, tagDefinitionIds: string[]): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = createAdminClient()

  // An item may carry its own store's tags or the platform presets — never a
  // tag definition that belongs to another store.
  if (tagDefinitionIds.length > 0) {
    const { data: allowed, error: allowedError } = await supabase
      .from('tag_definitions')
      .select('id')
      .in('id', tagDefinitionIds)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    if (allowedError) throw allowedError
    const allowedIds = new Set(((allowed ?? []) as { id: string }[]).map((t) => t.id))
    if (tagDefinitionIds.some((id) => !allowedIds.has(id))) {
      throw new Error('One or more tags are not available to this store')
    }
  }
  const { error: deleteError } = await supabase
    .from('menu_item_tags')
    .delete()
    .eq('menu_item_id', itemId)
    .eq('tenant_id', tenantId)
  if (deleteError) throw deleteError
  if (tagDefinitionIds.length > 0) {
    const rows = tagDefinitionIds.map((tagId) => ({
      menu_item_id: itemId,
      tag_definition_id: tagId,
      tenant_id: tenantId,
    }))
    const { error: insertError } = await supabase.from('menu_item_tags').insert(rows)
    if (insertError) throw insertError
  }
}
