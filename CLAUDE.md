# Lista da Feira

App de lista de compras colaborativa em tempo real, migrando de um artefato do Claude para um app Android (Vite + JS puro + Supabase + Capacitor). O plano completo está em `MIGRACAO.md`; siga os passos em ordem.

## Referências
- `referencia/lista-da-feira-claude.html`: versão original que funciona. É a fonte da verdade para visual, textos e comportamento.
- `supabase/schema.sql`: esquema do banco com RLS, já testado. Mudanças no banco entram como migrations novas, nunca editando o que já rodou em produção.

## Regras do projeto
- A interface é em português do Brasil, com o tom curto e direto que já existe.
- Visual escuro: fundo #0a0a0b com grade de pontinhos, acento laranja #ff6b1a, fontes Geist e Geist Mono. Sem gradiente laranja no fundo.
- Não use IA nas funções "inteligentes": a categorização é um dicionário mais uma tabela `learned` por ambiente, e as sugestões são o ritmo de compra calculado a partir de `trips`.
- Toda escrita é otimista (atualiza a tela na hora) e é confirmada pelo Realtime.
- Permissões ficam no banco (RLS e funções `security definer`), nunca só na interface.
- Segredos só em `.env` (nunca commitar). No app vai apenas a anon key.

## Comandos
- `npm run dev`: desenvolvimento no navegador
- `npm run build && npx cap sync android`: atualizar o projeto Android
- `npx cap open android`: abrir no Android Studio

## Comportamentos que não podem se perder
- Riscar: o item fica riscado no lugar por cerca de 0,6 s e depois desliza para o fim da categoria (o último riscado fica acima dos anteriores); o check fica cinza.
- Categoria toda riscada: recolhe e vai para o fim; reabre se entrar um item novo nela.
- Ao arrastar uma categoria, todas recolhem.
- Lista toda riscada: tela "Compra finalizada", com opções de ver os itens riscados e de usar a lista de novo.
- Enter cria o próximo item; Backspace num item vazio apaga e volta para o anterior.
- Colar várias linhas cria vários itens.
- Uma frase vira vários itens ("arroz, feijão, leite e pão" → 4 itens; "2 kg de arroz e 3 latas de atum" → 2; "papel higiênico" continua 1). Na dúvida, não divide. O chip da barra mostra "N itens" antes de enviar.
- Escolher a categoria na mão ensina o app (`learned`).
- Indicador de quem está online: até 3 avatares; com 4 ou mais, 2 avatares e "+N".
- Sugestões: "Enviar sugestão" no menu do avatar; convite discreto na tela "Compra finalizada" a partir da 3ª compra (com × para dispensar); caixa de entrada só para o admin do app; aviso único "Você sugeriu, nós fizemos" para quem sugeriu.

## Privacidade
- Analytics e Clarity só depois do consentimento na primeira abertura.
- Nunca envie o texto de itens, listas, ambientes ou nomes em eventos; no Clarity, mascare esses textos.

## Progresso
- Passo 8.5 (voz): feito, não commitado. `src/voz.js` usa `@capacitor-community/speech-recognition` (pt-BR, parciais ao vivo no campo, tocar de novo para parar); no navegador, Web Speech API; sem reconhecimento, o botão some. O texto final passa por `splitItems` e abre uma folha de confirmação (editar/remover cada item); "Adicionar" usa `addTexts` (`src/ui.js`), o mesmo caminho da barra (categoria automática e aprendizado do chip manual). `RECORD_AUDIO` vem do manifesto do plugin. Falta testar no aparelho e declarar o microfone na Segurança dos dados do Google Play.
- Ícone novo (adaptive icon gerado com `@capacitor/assets` a partir de `assets/`, fundo laranja #ff6b1a) e nome do app no celular "Lista" (`strings.xml` e `appName`); o pacote `br.com.listadafeira` e os textos dentro do app não mudaram.
- Passada minimalista (só interface): lista vazia sem barra/contador e com a linha "Adicione o primeiro item"; chip de categoria sem o rótulo "auto"; placeholder "Adicionar item". Menu do avatar: uma linha de ambiente (nome + "N membros"; com 2+ ambientes o nome vira seletor), "Renomear" virou lápis na tela de Membros, itens só de texto, "Novo ambiente" abre a escolha Criar/Entrar com código, "Sair da conta" ao fim, e o diagnóstico (OTA/Supabase) só aparece com 5 toques na versão em 3 s.
- Lista (UI): check à direita (alvo de 56 px na altura da linha), ⋮ só com o item em edição, sem lápis no nome da categoria, bloco selecionado (`S.selectedCat`, borda laranja, só ele mostra "+ Adicionar item"; check, ⋮, alças e nome da categoria não selecionam) e lista vazia sem mensagem.
