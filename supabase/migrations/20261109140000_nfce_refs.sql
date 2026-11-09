-- Importar nota (NFC-e): memória por ambiente, qualquer membro.
--   kind 'link'    : ref = 'cnpj|código do item na nota', key = chave do item no app (keyOf)  -> casamento lembrado
--   kind 'receipt' : ref = chave de acesso (44 dígitos)                                         -> nota já importada
-- O id é determinístico (env|l|cnpj|código ou env|r|chave): gravar de novo atualiza em vez de duplicar.
-- Nada do consumidor (CPF, nome) é guardado.
create table public.nfce_refs (
  id      text primary key,
  env_id  uuid not null references public.envs on delete cascade,
  kind    text not null check (kind in ('link', 'receipt')),
  ref     text not null check (char_length(ref) <= 100),
  key     text check (char_length(key) <= 200),
  at      timestamptz not null default now(),
  check (starts_with(id, env_id::text || '|'))      -- um ambiente não ocupa o id de outro
);
create index nfce_refs_env_idx on public.nfce_refs (env_id, at);
alter table public.nfce_refs enable row level security;
create policy "membros usam nfce_refs" on public.nfce_refs
  for all using (is_member(env_id)) with check (is_member(env_id));
alter publication supabase_realtime add table public.nfce_refs;
