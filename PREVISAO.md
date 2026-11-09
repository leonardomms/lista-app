# Previsão de gastos (6 etapas)

Cada etapa em conversa própria. Ao terminar, registrar aqui e em "Progresso" no `CLAUDE.md`.

| # | Etapa | Status |
|---|-------|--------|
| 1 | Locais de compra e local padrão/alternativo por categoria | feito |
| 2 | Preço por item e local, informado ao riscar o item como comprado (tabela `prices`: `env_id`, chave do item via `keyOf`, `place_id`, preço, data; RLS de membro como em `trips`) | feito |
| 3 | Previsão do total na lista (soma dos itens não riscados: preço no local padrão → alternativo → qualquer local) | feito |
| 4 | Edge Function `nfce-parse` (lê NFC-e do RS: itens, preços em centavos, CNPJ/nome do emissor) | feito, falta deploy |
| 5 | a definir | a fazer |
| 6 | a definir | a fazer |
