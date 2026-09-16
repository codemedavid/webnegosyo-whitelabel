-- Explicitly distinguish quantity add-ons from choice groups, independent of
-- their total selection cap. Existing library definitions retain choice rules.
ALTER TABLE public.modifier_group_library
  ADD COLUMN IF NOT EXISTS selection_mode TEXT NOT NULL DEFAULT 'choice'
  CHECK (selection_mode IN ('choice', 'quantity'));

COMMENT ON COLUMN public.modifier_group_library.selection_mode IS
  'choice selects distinct options; quantity allows portions of each add-on, with min/max counting total portions per parent item.';
