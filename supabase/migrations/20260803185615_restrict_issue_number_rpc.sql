-- Issue identifiers are allocated by the trusted backend, not directly by
-- browser clients. Keep the function invoker-safe and available to service_role.
alter function public.claim_issue_number(uuid) security invoker;
revoke execute on function public.claim_issue_number(uuid) from anon, authenticated, public;
grant execute on function public.claim_issue_number(uuid) to service_role;
