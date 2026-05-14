-- Smoke test untuk trigger 07_auth_user_provisioning.sql.
-- Hanya untuk environment bootstrap_test (auth.users polos).
do $$
declare
  v_user uuid;
  v_role_name text;
begin
  insert into auth.users(email, raw_user_meta_data)
  values ('newbie+1@test.local', '{"name":"Pengguna Test"}'::jsonb)
  returning id into v_user;

  select r.name into v_role_name
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = v_user;

  if v_role_name is null then
    raise exception 'ASSERTION FAILED: profil public.users tidak terbuat untuk %', v_user;
  end if;

  raise notice 'OK: user baru % di-assign role %', v_user, v_role_name;
end$$;
