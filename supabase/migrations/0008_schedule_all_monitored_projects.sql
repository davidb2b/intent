-- Cada pesquisa pertence ao seu próprio usuário. O cron deve iniciar uma
-- coleta por projeto ativo que possua fontes aprovadas, sem eleger um único
-- projeto global por ordem de criação.
do $migration$
declare
  monitoring_job_id bigint;
begin
  select jobid
    into monitoring_job_id
    from cron.job
   where jobname = 'signal-lab-weekly-monitoring';

  if monitoring_job_id is null then
    raise exception 'Job signal-lab-weekly-monitoring não encontrado';
  end if;

  perform cron.alter_job(
    job_id := monitoring_job_id,
    command := $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_project_url') || '/functions/v1/run-monitoring',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_publishable_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_publishable_key'),
          'x-scheduler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_scheduler_secret')
        ),
        body := jsonb_build_object(
          'projectId', project.id::text,
          'janela', 'month'
        )
      )
      from public.projetos as project
      where project.ativo = true
        and exists (
          select 1
            from public.fontes as source
           where source.projeto_id = project.id
             and source.status = 'monitorada'
        );
    $job$
  );
end
$migration$;
