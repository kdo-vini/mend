alter table public.workflow_facts
  drop constraint workflow_facts_fact_type_check;

alter table public.workflow_facts
  add constraint workflow_facts_fact_type_check check (fact_type in (
    'eligible', 'policy_required_touch', 'founder_intervention', 'escalated',
    'grounded_answer', 'ai_resolved', 'fix_verified', 'cost_recorded',
    'knowledge_sync_started', 'knowledge_sync_completed', 'knowledge_sync_failed',
    'knowledge_retrieval_sufficient', 'knowledge_retrieval_insufficient',
    'knowledge_retrieval_stale_blocked', 'knowledge_product_ambiguous',
    'knowledge_deep_research_started', 'knowledge_deep_research_completed',
    'knowledge_customer_reply_rejected'
  ));
