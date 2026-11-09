-- Histórico de preços: um registro por preço informado (nunca sobrescreve). Por ambiente, qualquer membro.
-- key = chave do item (keyOf), place_id = id do local no ambiente (texto; null = sem local), price em reais.
create table public.prices (
  id        uuid primary key default gen_random_uuid(),
  env_id    uuid not null references public.envs on delete cascade,
  key       text not null,
  place_id  text,
  price     numeric(10,2) not null check (price > 0),
  at        timestamptz not null default now()
);
create index prices_env_idx on public.prices (env_id, key, at);
alter table public.prices enable row level security;
create policy "membros usam precos" on public.prices
  for all using (is_member(env_id)) with check (is_member(env_id));
alter publication supabase_realtime add table public.prices;
