\set ON_ERROR_STOP on

-- Minimal pg_cron contract for disposable PostgreSQL validation. Production
-- uses the real extension; tests only need to preserve job names and commands.
create schema if not exists cron;

create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text not null unique,
  schedule text,
  command text
);

create or replace function cron.schedule(job_name text, job_schedule text, job_command text)
returns bigint
language plpgsql
as $$
declare
  scheduled_id bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (job_name, job_schedule, job_command)
  on conflict (jobname) do update
    set schedule = excluded.schedule,
        command = excluded.command
  returning jobid into scheduled_id;
  return scheduled_id;
end;
$$;

create or replace function cron.unschedule(target_job_id bigint)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = target_job_id;
  return found;
end;
$$;

create or replace function cron.alter_job(job_id bigint, command text)
returns void
language plpgsql
as $$
begin
  update cron.job set command = alter_job.command where jobid = alter_job.job_id;
end;
$$;
