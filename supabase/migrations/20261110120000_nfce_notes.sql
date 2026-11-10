-- Histórico de notas: a nota importada (local, data, total e linhas com o id do preço que cada uma gravou)
-- fica no próprio registro 'receipt' de nfce_refs, em jsonb. Nada do consumidor (CPF, nome) é guardado.
alter table public.nfce_refs add column if not exists data jsonb;
