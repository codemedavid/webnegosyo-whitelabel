-- Manager approvals were readable store-wide by any `discount_review` holder,
-- so a reviewer locked to one branch saw every branch's approvals (approver
-- and cashier names, amounts). Scope them exactly like the sales book
-- (`gov_discount_claims_read_reviewer`): store-wide accounts see all, a
-- branch account only its own branch's approvals. An approval with no outlet
-- (a store-wide sale) follows `app_user_may_reach_branch`'s NULL rule.

DROP POLICY IF EXISTS gov_discount_approvals_read ON public.gov_discount_approvals;
CREATE POLICY gov_discount_approvals_read ON public.gov_discount_approvals FOR SELECT TO authenticated
  USING (
    public.app_user_has_permission(tenant_id, 'discount_review')
    AND public.app_user_may_reach_branch(tenant_id, outlet_id)
  );

-- Rollback:
--   DROP POLICY IF EXISTS gov_discount_approvals_read ON public.gov_discount_approvals;
--   CREATE POLICY gov_discount_approvals_read ON public.gov_discount_approvals FOR SELECT TO authenticated
--     USING (public.app_user_has_permission(tenant_id, 'discount_review'));
