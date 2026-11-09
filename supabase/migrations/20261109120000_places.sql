-- Locais de compra e local padrão/alternativo por categoria (por ambiente).
-- places     = [{id,name,cnpj}]            (null = usa os exemplos do app)
-- cat_places = {catId:{def,fb}}            (null = padrões do app)
alter table public.envs
  add column places     jsonb,
  add column cat_places jsonb;

-- troca a função para aceitar os dois campos novos (qualquer membro ativo, como categorias/aprendido)
drop function if exists public.update_env_prefs(uuid, jsonb, jsonb, jsonb);
create function public.update_env_prefs(
  e uuid,
  p_custom_categories  jsonb default null,
  p_category_overrides jsonb default null,
  p_learned            jsonb default null,
  p_places             jsonb default null,   -- [{id,name,cnpj}]
  p_cat_places         jsonb default null    -- {catId:{def,fb}}
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_member(e) then raise exception 'sem_permissao'; end if;
  if (p_custom_categories  is not null and (jsonb_typeof(p_custom_categories)  <> 'array'  or octet_length(p_custom_categories::text)  > 100000))
  or (p_category_overrides is not null and (jsonb_typeof(p_category_overrides) <> 'object' or octet_length(p_category_overrides::text) > 100000))
  or (p_learned            is not null and (jsonb_typeof(p_learned)            <> 'object' or octet_length(p_learned::text)            > 200000))
  or (p_places             is not null and (jsonb_typeof(p_places)             <> 'array'  or octet_length(p_places::text)             > 50000))
  or (p_cat_places         is not null and (jsonb_typeof(p_cat_places)         <> 'object' or octet_length(p_cat_places::text)         > 50000))
  then raise exception 'dados_invalidos'; end if;

  update envs set
    custom_categories  = coalesce(p_custom_categories,  custom_categories),
    category_overrides = coalesce(p_category_overrides, category_overrides),
    learned            = coalesce(p_learned,            learned),
    places             = coalesce(p_places,             places),
    cat_places         = coalesce(p_cat_places,         cat_places)
  where id = e;
end $$;

revoke all on function public.update_env_prefs(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_env_prefs(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
