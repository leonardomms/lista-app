-- Qualquer membro ativo do ambiente salva categorias e o "aprendido".
-- A policy de UPDATE em envs continua só para admin (renomear, convite etc.).
-- Rode no SQL Editor do Supabase.
create or replace function public.update_env_prefs(
  e uuid,
  p_custom_categories  jsonb default null,   -- [{id,name,color}]
  p_category_overrides jsonb default null,   -- {catId:{name,color,deleted}}
  p_learned            jsonb default null    -- {"salada":"fruteira"}
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_member(e) then raise exception 'sem_permissao'; end if;
  if (p_custom_categories  is not null and (jsonb_typeof(p_custom_categories)  <> 'array'  or octet_length(p_custom_categories::text)  > 100000))
  or (p_category_overrides is not null and (jsonb_typeof(p_category_overrides) <> 'object' or octet_length(p_category_overrides::text) > 100000))
  or (p_learned            is not null and (jsonb_typeof(p_learned)            <> 'object' or octet_length(p_learned::text)            > 200000))
  then raise exception 'dados_invalidos'; end if;

  update envs set
    custom_categories  = coalesce(p_custom_categories,  custom_categories),
    category_overrides = coalesce(p_category_overrides, category_overrides),
    learned            = coalesce(p_learned,            learned)
  where id = e;
end $$;

revoke all on function public.update_env_prefs(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_env_prefs(uuid, jsonb, jsonb, jsonb) to authenticated;
