-- Quantidade por item (inteiro de 1 a 99). Itens antigos ficam com 1; o preço guardado continua sendo o da unidade.
alter table public.items add column if not exists qty integer not null default 1 check (qty between 1 and 99);
