# Previsão de gastos (6 etapas)

Cada etapa em conversa própria. Ao terminar, registrar aqui e em "Progresso" no `CLAUDE.md`.

| # | Etapa | Status |
|---|-------|--------|
| 1 | Locais de compra e local padrão/alternativo por categoria | feito |
| 2 | Preço por item e local, informado ao riscar o item como comprado (tabela `prices`: `env_id`, chave do item via `keyOf`, `place_id`, preço, data; RLS de membro como em `trips`) | feito |
| 3 | Previsão do total na lista (soma dos itens não riscados: preço no local padrão → alternativo → qualquer local) | feito |
| 4 | Edge Function `nfce-parse` (lê NFC-e do RS: itens, preços em centavos, CNPJ/nome do emissor) | feito e no ar |
| 5 | Importar nota: QR ou link/chave → `nfce-parse` → local pelo CNPJ → casamento das linhas com os itens → preços em `S.prices`; vínculos (CNPJ + código → item) e notas já importadas em `nfce_refs` | feito (rodar a migration `20261109140000_nfce_refs.sql`) |
| 6 | Importar o PDF da nota (plano C, quando o QR/link não abrir): ler o texto do PDF que o site da Sefaz gera, sem IA, e entregar o mesmo `{issuer, date, accessKey, items, total}` ao fluxo do Estágio 5 | a fazer |
