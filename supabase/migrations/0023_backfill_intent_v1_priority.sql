-- Recalculate historical people and account levels with the official Intent v1
-- rules so persisted status never disagrees with the score shown to customers.

do $$
declare
  target_person record;
begin
  for target_person in select id from public.pessoas loop
    perform * from public.intent_recalculate_person_intent(target_person.id);
  end loop;
end;
$$;

with company_people as (
  select
    company.id,
    count(person.id) filter (
      where person.status in ('lead', 'sinal_fraco', 'cliente')
    )::integer as people_with_signal
  from public.empresas company
  left join public.pessoas person
    on person.empresa_id = company.id
   and person.projeto_id = company.projeto_id
  group by company.id
)
update public.empresas company
   set pessoas_com_sinal = company_people.people_with_signal,
       nivel = case
         when company_people.people_with_signal >= 2 then 'em_movimento'
         when company_people.people_with_signal = 1 then 'aquecendo'
         else 'fria'
       end
  from company_people
 where company.id = company_people.id;
