-- pg_cron executa a Edge Function sem uma sessão de usuário. O gateway ainda
-- exige uma credencial válida, portanto o job envia a chave pública pelo
-- Authorization e pelo apikey, ambos lidos do Vault em tempo de execução.
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
          'projectId', (select id::text from public.projetos order by criado_em asc limit 1),
          'janela', 'month'
        )
      );
    $job$
  );
end
$migration$;
