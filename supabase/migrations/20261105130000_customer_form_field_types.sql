-- Checkout questions: three more kinds (Page Designer form editor, plan
-- docs/plans/2026-11-05-page-designer-v3-style-templates-forms.md, D7).
--
--   choice    one answer picked from buttons (the `options` list, like select)
--   checkbox  a single tick box; a ticked box stores 'yes', unticked stores
--             nothing, so "required" means "must tick"
--   date      a calendar date, stored as YYYY-MM-DD
--
-- Only the CHECK widens. Every existing row keeps its type. A client that does
-- not know a type (an older checkout, the register) asks it as text, which is
-- safe: the answer is still a string under the field's own name.
--
-- The constraint was declared inline in 0009_order_types.sql, so Postgres
-- named it customer_form_fields_field_type_check.

alter table public.customer_form_fields
  drop constraint if exists customer_form_fields_field_type_check;

alter table public.customer_form_fields
  add constraint customer_form_fields_field_type_check
  check (field_type in ('text', 'email', 'phone', 'textarea', 'select', 'number', 'choice', 'checkbox', 'date'));
