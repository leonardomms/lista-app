-- =====================================================================
-- Lista da Feira — esquema do Supabase
-- Rode no SQL Editor do Supabase (projeto novo). Idempotência não é garantida:
-- rode uma vez num banco vazio.
--
-- Modelo:
--   envs         = ambientes ("Minha casa", "Casa da mãe")
--   env_members  = quem participa de cada ambiente (admin/membro/removido)
--   lists        = listas de um ambiente
--   items        = itens de uma lista
--   trips        = histórico de compras concluídas (alimenta "você deve precisar de…")
--   profiles     = nome e cor de cada usuário (visível para quem divide ambiente)
--
-- Segurança: Row Level Security em tudo. Só membros ativos de um ambiente
-- leem/escrevem os dados dele. Entrar num ambiente só pela função join_env(token).
-- =====================================================================

-- ---------- perfis ----------
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default '',
  color       text not null default '#ff6b1a',
  created_at  timestamptz not null default now()
);

-- cria o perfil automaticamente quando alguém faz login pela primeira vez
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- ambientes ----------
create table public.envs (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null default 'Minha casa',
  invite_token        text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_by          uuid not null default auth.uid() references auth.users on delete cascade,
  created_at          timestamptz not null default now(),
  custom_categories   jsonb not null default '[]'::jsonb,   -- [{id,name,color}]
  category_overrides  jsonb not null default '{}'::jsonb,   -- {catId:{name,color,deleted}}
  learned             jsonb not null default '{}'::jsonb    -- {"salada":"fruteira"}
);

create table public.env_members (
  env_id     uuid not null references public.envs on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  creator    boolean not null default false,
  removed    boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (env_id, user_id)
);

-- funções auxiliares usadas nas regras (security definer evita recursão no RLS)
create function public.is_member(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from env_members
                 where env_id = e and user_id = auth.uid() and not removed);
$$;

create function public.is_admin(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from env_members
                 where env_id = e and user_id = auth.uid() and not removed and role = 'admin');
$$;

-- quem cria o ambiente vira admin e "criador" automaticamente
create function public.handle_new_env() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into env_members (env_id, user_id, role, creator)
  values (new.id, new.created_by, 'admin', true);
  return new;
end $$;

create trigger on_env_created
  after insert on public.envs
  for each row execute function public.handle_new_env();

-- entrar num ambiente pelo link de convite
create function public.join_env(token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e uuid;
  m env_members%rowtype;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select id into e from envs where invite_token = token;
  if e is null then raise exception 'convite_invalido'; end if;
  select * into m from env_members where env_id = e and user_id = auth.uid();
  if found and m.removed then raise exception 'removido'; end if;
  if not found then
    insert into env_members (env_id, user_id, role) values (e, auth.uid(), 'member');
  end if;
  return e;
end $$;

-- gerar um novo link (invalida o anterior) — só admin
create function public.rotate_invite(e uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not is_admin(e) then raise exception 'sem_permissao'; end if;
  t := encode(extensions.gen_random_bytes(12), 'hex');
  update envs set invite_token = t where id = e;
  return t;
end $$;

-- ---------- listas, itens e histórico ----------
create table public.lists (
  id          uuid primary key default gen_random_uuid(),
  env_id      uuid not null references public.envs on delete cascade,
  title       text not null default '',
  done        boolean not null default false,
  cat_order   jsonb not null default '[]'::jsonb,
  dismissed   jsonb not null default '[]'::jsonb,   -- sugestões dispensadas nesta lista
  created_at  timestamptz not null default now()
);

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  env_id      uuid not null references public.envs on delete cascade,
  list_id     uuid not null references public.lists on delete cascade,
  text        text not null default '',
  cat         text not null default 'outros',
  ord         double precision not null default 0,
  checked     boolean not null default false,
  checked_at  timestamptz,
  created_by  uuid default auth.uid() references auth.users on delete set null,
  created_at  timestamptz not null default now()
);
create index items_list_idx on public.items (list_id);
create index items_env_idx on public.items (env_id);
create index lists_env_idx on public.lists (env_id);

create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  env_id      uuid not null references public.envs on delete cascade,
  list_id     uuid references public.lists on delete set null,
  at          timestamptz not null default now(),
  items       jsonb not null   -- [{k, text, cat}]
);
create index trips_env_idx on public.trips (env_id, at);

-- ---------- Row Level Security ----------
alter table public.profiles    enable row level security;
alter table public.envs        enable row level security;
alter table public.env_members enable row level security;
alter table public.lists       enable row level security;
alter table public.items       enable row level security;
alter table public.trips       enable row level security;

-- perfis: cada um edita o seu; vê o de quem divide algum ambiente
create policy "perfil proprio" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "perfis de quem divide ambiente" on public.profiles
  for select using (exists (
    select 1 from env_members a join env_members b on a.env_id = b.env_id
    where a.user_id = auth.uid() and not a.removed and b.user_id = profiles.id));

-- ambientes
-- "created_by = auth.uid()" permite o insert ... returning do criador
-- (o trigger que o torna membro roda depois da checagem do RETURNING)
create policy "membros veem o ambiente" on public.envs
  for select using (is_member(id) or created_by = auth.uid());
create policy "qualquer usuario cria ambiente" on public.envs
  for insert with check (created_by = auth.uid());
create policy "admins editam o ambiente" on public.envs
  for update using (is_admin(id)) with check (is_admin(id));
create policy "criador apaga o ambiente" on public.envs
  for delete using (created_by = auth.uid());

-- membros
create policy "membros veem membros" on public.env_members
  for select using (is_member(env_id) or user_id = auth.uid());
create policy "admins gerenciam membros (menos o criador)" on public.env_members
  for update using (is_admin(env_id) and not creator) with check (is_admin(env_id) and not creator);
create policy "sair do ambiente ou admin readmitir" on public.env_members
  for delete using (user_id = auth.uid() or (is_admin(env_id) and not creator));
-- inserção de membros acontece só pelos triggers/funções (security definer)

-- listas, itens, histórico: tudo liberado para membros ativos
create policy "membros usam listas" on public.lists
  for all using (is_member(env_id)) with check (is_member(env_id));
create policy "membros usam itens" on public.items
  for all using (is_member(env_id))
  with check (is_member(env_id) and exists (
    select 1 from lists l where l.id = items.list_id and l.env_id = items.env_id));
create policy "membros usam historico" on public.trips
  for all using (is_member(env_id)) with check (is_member(env_id));

-- funções que o app chama
grant execute on function public.join_env(text) to authenticated;
grant execute on function public.rotate_invite(uuid) to authenticated;

-- ---------- Realtime ----------
-- envia mudanças ao vivo para os apps conectados (respeitando o RLS)
alter table public.items       replica identity full;
alter table public.lists       replica identity full;
alter table public.env_members replica identity full;
alter publication supabase_realtime add table public.items, public.lists, public.env_members, public.envs, public.trips;

-- =====================================================================
-- Sugestões de quem usa o app
--   cada pessoa envia e vê só as próprias (para saber quando foram feitas);
--   quem está em app_admins (você) lê todas e marca como feitas.
-- Para se tornar admin do app, rode uma vez no SQL Editor:
--   insert into public.app_admins (user_id) values ('<seu user id do Authentication>');
-- =====================================================================
create table public.app_admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.app_admins enable row level security;
-- sem políticas: ninguém lê/escreve pelo app; só pelo painel do Supabase

create function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  kind        text not null default 'ideia' check (kind in ('ideia', 'problema', 'elogio')),
  text        text not null check (char_length(text) between 1 and 2000),
  ctx         jsonb not null default '{}'::jsonb,   -- {screen, env, version, device, lang}
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_note   text
);
create index feedback_user_idx on public.feedback (user_id);
alter table public.feedback enable row level security;

create policy "enviar a propria sugestao" on public.feedback
  for insert with check (user_id = auth.uid() and done_at is null);
create policy "ver as proprias sugestoes" on public.feedback
  for select using (user_id = auth.uid() or is_app_admin());
create policy "admin do app marca como feita" on public.feedback
  for update using (is_app_admin()) with check (is_app_admin());
