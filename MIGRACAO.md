# Lista da Feira — migração para app Android

Objetivo: transformar o app que hoje roda dentro do Claude (`referencia/lista-da-feira-claude.html`) em um app Android instalável (APK para testes, AAB para o Google Play), com login, ambientes, membros e colaboração em tempo real.

**Stack escolhida**
- **Vite + JavaScript puro**: reaproveita quase todo o código atual, sem reescrever em React.
- **Supabase**: Postgres, Auth, Realtime (dados ao vivo e presença) e RLS.
- **Capacitor**: empacota o app web como app Android.
- **Login com Google** nativo no Android (sem abrir navegador).

---

## Passo 0 — Preparar a máquina

- Node.js LTS e Git.
- **Android Studio** com Android SDK e um emulador, ou o seu celular com "Depuração USB" ligada.
- JDK 21 (vem com o Android Studio).
- Conta no Supabase e conta no Google Cloud (para o login com Google).
- Claude Code instalado, rodando na pasta do projeto.

Crie a pasta do projeto, copie este pacote para dentro dela e rode `git init`.

---

## Passo 1 — Banco no Supabase

1. Crie um projeto no Supabase (para desenvolver, o plano grátis serve).
2. Abra o **SQL Editor**, cole `supabase/schema.sql` e rode.
3. Em **Database → Publications**, confira se `supabase_realtime` tem as tabelas `items`, `lists`, `env_members`, `envs` e `trips`.
4. Anote a **Project URL** e a **anon key** (em Settings → API).

O `schema.sql` já foi testado num Postgres com usuários simulados. Ele garante que:
- só membros de um ambiente veem e editam as listas dele;
- quem é removido perde o acesso na hora e não volta pelo link;
- ninguém consegue remover ou rebaixar quem criou o ambiente;
- entrar num ambiente só é possível pela função `join_env(token)`.

---

## Passo 2 — Projeto web com Vite (prompt para o Claude Code)

> Crie um projeto Vite com JavaScript puro nesta pasta. Use `referencia/lista-da-feira-claude.html` como base: mantenha o visual, o CSS, os textos e todos os comportamentos. Separe em `index.html`, `src/styles.css` e módulos em `src/` (ui, categorias, sugestões, ambientes, dados). Instale o SortableJS pelo npm em vez da CDN e as fontes Geist pelo `@fontsource`. Ainda não troque a camada de dados: deixe a função `window.claude` ausente, para o app rodar no "modo local". Rode `npm run dev` e confirme que a tela funciona igual à referência.

Verifique no navegador: criar lista, adicionar itens, riscar (o item desce), arrastar e categorias automáticas.

---

## Passo 3 — Trocar a camada de dados para o Supabase

O código atual fala com `claude.use("db")`, `claude.use("user")` e `claude.use("room")`. A tarefa é trocar isso por uma camada própria, `src/data.js`, sobre o Supabase.

| Hoje (Claude) | Supabase |
|---|---|
| coleção `envs/{id}/lists` e `items` | tabelas `lists` e `items` filtradas por `env_id` |
| `onSnapshot` | carga inicial com `select` mais `channel().on('postgres_changes', …)` filtrado por `env_id` |
| `config/categories` e `config/learned` | colunas `custom_categories`, `category_overrides` e `learned` da tabela `envs` |
| `history` | tabela `trips` |
| `envs/{id}/members` | tabela `env_members` |
| perfil privado (`data/users/…/profile`) | dispensado: os ambientes da pessoa são os registros dela em `env_members` |
| `user.me()` / `profiles()` | tabela `profiles` |
| `room` (presença) | `supabase.channel('env:'+id).track({list})` mais o evento `presence` |
| código do ambiente | `envs.invite_token` mais `rpc('join_env', {token})` |

**Prompt para o Claude Code:**
> Crie `src/data.js` usando `@supabase/supabase-js`, com URL e anon key vindas de `.env` (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`). Substitua todo uso de `window.claude` pela camada nova, seguindo a tabela do MIGRACAO.md. Regras:
> 1. Ao abrir um ambiente: carregue `lists`, `items` e `trips` daquele `env_id` e assine um canal Realtime com `postgres_changes` filtrado por `env_id=eq.<id>` para as três tabelas, mais `envs` e `env_members`. Mantenha o estado em Maps como hoje e chame `render()`.
> 2. Escritas: mantenha a atualização otimista que já existe (`apply` + `render`) e envie `insert`/`update`/`delete`. Não aplique de novo um eco do Realtime que já está no estado.
> 3. Os campos mudam de camelCase para snake_case (`listId`→`list_id`, `order`→`ord`, `checkedAt`→`checked_at`, `createdAt`→`created_at`, `catOrder`→`cat_order`). Faça a conversão num lugar só.
> 4. Presença: um canal por ambiente com `track({ list: listaAberta })`, usado no indicador de quem está online (o compacto, com +N).
> 5. Aviso do "modo compra": use o evento INSERT de `items` (ou o UPDATE que preenche o texto) quando `created_by` for outra pessoa.
> 6. Membros: tornar admin, tirar admin, remover (`removed=true`), readmitir (apagar a linha) e sair (apagar a própria linha). As permissões já são garantidas pelo RLS.
> 7. Trate os erros `convite_invalido` e `removido` de `join_env` com as mesmas mensagens que o app já usa.

Para testar o tempo real, abra duas janelas do navegador com duas contas diferentes (uma delas numa janela anônima).

---

## Passo 4 — Login

1. **Google Cloud Console:** crie credenciais OAuth: um "Web client" (usado pelo Supabase) e um "Android client", com o nome do pacote (ex.: `br.com.listadafeira`) e o SHA-1 da sua chave de assinatura (de debug e de release).
2. **Supabase → Authentication → Providers → Google:** ative e cole o Client ID e o Secret do Web client.
3. **No app:** tela de entrada com "Entrar com Google". No Android, use login nativo para obter o `idToken` e chame `supabase.auth.signInWithIdToken({ provider: 'google', token })`. No navegador, durante o desenvolvimento, use `signInWithOAuth`.

**Prompt:**
> Adicione uma tela de login antes do app: "Entrar com Google". No navegador use `supabase.auth.signInWithOAuth`. No Android use um plugin Capacitor de login social com Google para obter o idToken e `signInWithIdToken`. Mantenha a sessão (o Supabase já persiste). No primeiro login, se a pessoa não tem nenhum ambiente e não veio de um convite, crie "Minha casa". No menu do avatar, adicione "Sair da conta" e "Excluir minha conta" (a exclusão é exigida pelo Google Play; implemente com uma Edge Function que apaga o usuário).

---

## Passo 5 — Links de convite que abrem o app

O link passa a ser seu, por exemplo `https://listadafeira.com.br/convite/<token>`.

- **Com o app instalado:** os Android App Links abrem direto no app. É preciso publicar o arquivo `/.well-known/assetlinks.json` no seu domínio, com o pacote e o SHA-256 da chave.
- **Sem o app:** a mesma URL mostra uma página simples, com o botão para baixar no Google Play.

**Prompt:**
> Configure Android App Links para `https://<dominio>/convite/<token>`: o intent filter no AndroidManifest, o listener `App.addListener('appUrlOpen')` do Capacitor chamando `rpc('join_env')` e uma página web `convite.html` de fallback. Gere o `assetlinks.json`. A tela "Convidar" do app passa a usar esse link nos botões de WhatsApp, E-mail e Copiar. Pode remover o passo "compartilhe pelo Claude", que deixa de existir.

Se ainda não tiver domínio, dá para começar com um link na Vercel (`seuapp.vercel.app/convite/…`).

---

## Passo 6 — Empacotar com o Capacitor e gerar o APK

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/app
npx cap init "Lista da Feira" br.com.listadafeira --web-dir=dist
npm run build
npx cap add android
npx cap sync android
npx cap open android   # abre no Android Studio
```

- **APK de teste:** no Android Studio, *Build → Build App Bundle(s)/APK(s) → Build APK(s)*. Instale no celular e mande para os amigos testarem.
- **Para o Google Play:** *Build → Generate Signed App Bundle* gera um **AAB** assinado. Guarde a keystore e a senha com muito cuidado: sem elas você não consegue atualizar o app.
- Ajuste o ícone e a splash screen com `@capacitor/assets`.
- A barra de status escura e as margens seguras já são tratadas pelo CSS (`env(safe-area-inset-*)`). Confira no aparelho.

**Prompt:**
> Configure o Capacitor para Android neste projeto: nome "Lista da Feira", pacote `br.com.listadafeira`, ícone e splash a partir de `assets/icon.png` com fundo #0a0a0b, status bar escura e o botão Voltar do Android fechando sheets e voltando da lista para a tela inicial. Gere um APK de debug e me diga onde ele ficou.

---

## Passo 7 — Sugestões de melhoria dentro do app

Já existe na versão do Claude (veja a referência). No Supabase, use as tabelas `feedback` e `app_admins` do `schema.sql`.

Como funciona:
- **"Enviar sugestão"** fica no menu do avatar, sem botão flutuante.
- Na tela **"Compra finalizada"** aparece uma linha discreta, "Algo poderia ser melhor? Me conta", só a partir da 3ª compra concluída, e com × para não mostrar de novo.
- O formulário tem três opções (Ideia, Algo deu errado, Elogio) e um texto. Junto vão versão, tela, ambiente e aparelho, nunca o conteúdo das listas.
- **Você** (registrado em `app_admins`) vê "Sugestões recebidas", com um pontinho verde no avatar quando chega algo novo, e marca como **feito**, com uma nota opcional.
- Quem sugeriu vê uma vez a tela **"Você sugeriu, nós fizemos"**.

**Prompt:**
> Porte o recurso de sugestões da referência (`openFeedback`, `openInbox`, `afterBootFeedback`) para o Supabase usando a tabela `feedback`: insert no envio, select das próprias sugestões para o aviso "nós fizemos", select de todas e update de `done_at`/`done_note` na caixa de entrada, que só aparece se `is_app_admin()` retornar true (chame via `rpc`). Guarde "já viu" e "dispensou o convite" no Capacitor Preferences.

**Receber as sugestões no celular (opcional):** no Supabase, *Database → Webhooks*, crie um webhook no INSERT de `feedback` chamando uma Edge Function que manda a mensagem para um bot do Telegram (ou um e-mail pelo Resend).

> Crie uma Edge Function `notify-feedback` que recebe o payload do Database Webhook da tabela `feedback` e envia para o Telegram (`TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` como secrets) uma mensagem com o tipo, o texto, a tela e o nome do perfil de quem enviou.

---

## Passo 8 — Google Analytics (Firebase) e Microsoft Clarity

As duas funcionam num APK instalado fora da loja. O canal de instalação não importa.

1. **Firebase:** crie um projeto, adicione um app Android com o mesmo pacote (`br.com.listadafeira`), baixe o `google-services.json` para `android/app/` e ative o Google Analytics no projeto.
2. **Clarity:** crie um projeto "mobile" em clarity.microsoft.com e pegue o Project ID. A documentação oficial lista SDK para Android, React Native, Flutter e **Cordova/Ionic**, não o Capacitor diretamente. Teste o plugin Cordova no Capacitor. Se não funcionar, use o SDK Android nativo por um plugin Capacitor simples.
3. **Privacidade (LGPD), antes de coletar qualquer coisa:**
   - Na primeira abertura, mostre uma tela curta: "Coletamos dados de uso anônimos para melhorar o app", com link para a política de privacidade e os botões "Ok" e "Não, obrigado". Só ligue o Analytics e o Clarity depois do "Ok" (`setConsent` / `setEnabled`).
   - No Clarity, **mascare** os textos dos itens, os nomes das listas, dos ambientes e das pessoas. Você quer ver comportamento, não conteúdo.
   - Nos eventos do Analytics, mande só categorias e contagens, nunca o texto dos itens.
   - Ao publicar no Google Play, declare as duas ferramentas no formulário de Segurança dos dados.

**Eventos sugeridos** (respondem perguntas reais):

| Evento | Parâmetros | Para descobrir |
|---|---|---|
| `lista_criada` | — | uso geral |
| `item_adicionado` | `origem` (barra, enter, categoria, sugestao, colar), `categoria` | qual forma de adicionar as pessoas usam |
| `item_riscado` | `categoria` | |
| `categoria_corrigida` | `de`, `para` | onde a categorização automática erra |
| `compra_finalizada` | `itens`, `minutos_desde_primeiro_risco` | duração de uma compra |
| `sugestao_ritmo` | `acao` (adicionada, dispensada, adicionar_todos) | se as sugestões são úteis |
| `convite_enviado` | `canal` (whatsapp, email, copiar) | como o app se espalha |
| `ambiente_entrou` | — | convites que viraram uso |
| `feedback_enviado` | `tipo` | |

**Prompt:**
> Adicione analytics com consentimento: (1) tela de aviso de privacidade na primeira abertura, guardando a escolha no Capacitor Preferences e com opção de mudar depois no menu do avatar; (2) `@capacitor-firebase/analytics`, ligado só com consentimento, com os eventos da tabela do MIGRACAO.md e `setCurrentScreen` em cada tela (inicial, lista, sheets principais); (3) Microsoft Clarity com o Project ID em `.env`, ligado só com consentimento e com máscara em todos os textos de itens, listas, ambientes e nomes. Nunca envie o texto digitado pelo usuário em eventos.

---

## Passo 8.5 — Adicionar itens por voz

A divisão de frases em vários itens já existe na referência (`splitItems`, `segmentKnown`). Ela funciona sem IA, com separadores (vírgula, "e", "mais") e o dicionário de categorias, e trata quantidades ("2 kg de arroz") e complementos ("leite sem lactose", "macarrão integral"). Falta só o microfone, que no APK funciona com o reconhecimento de voz nativo do Android, gratuito.

**Prompt:**
> Adicione ditado por voz na barra de adicionar. O botão de microfone da referência (`#addBtn`, discreto, no mesmo estilo do chip de categoria) já substitui o antigo botão "+": o envio do texto digitado fica só no Enter do teclado. Se já houver texto no campo, o que for ditado entra depois dele, separado por vírgula. Use o plugin `@capacitor-community/speech-recognition` com `language: "pt-BR"` e `partialResults: true`. Ao tocar: peça a permissão de microfone (com uma explicação curta antes), mostre o campo em estado "ouvindo…" com a transcrição parcial aparecendo ao vivo e um botão para parar. Ao terminar, passe o texto final pelo `splitItems` da referência, adicione os itens e mostre o toast "N itens adicionados" com Desfazer (igual à referência). Se a permissão for negada, esconda o botão e mostre uma vez a dica de usar o microfone do teclado. Adicione `<uses-permission android:name="android.permission.RECORD_AUDIO"/>` no AndroidManifest e registre o evento `item_adicionado` com `origem: "voz"`.

No formulário de Segurança dos dados do Google Play, declare o uso do microfone (só para ditado; o áudio não é guardado).

---

## Passo 9 (depois) — Notificações push de verdade

Substituem o aviso que hoje só aparece com o app aberto.
- Firebase Cloud Messaging com o plugin `@capacitor/push-notifications`.
- Uma tabela `device_tokens` e uma **Edge Function** ou um **Database Webhook** no insert de `items`, que notifica os outros membros que estão em "modo compra".

---

## Passo 10 — Google Play

1. Crie a conta de desenvolvedor pessoal (US$ 25, uma vez).
2. Monte o **teste fechado** com pelo menos 12 testadores por 14 dias seguidos, exigência para contas pessoais novas.
3. Prepare a ficha da loja: ícone, capturas de tela, descrição, **política de privacidade** (URL pública) e o formulário de **Segurança dos dados**.
4. Configure as **assinaturas** no Play Console e integre o RevenueCat ou o Google Play Billing (a decisão "quem paga" vem antes).
5. Publique em produção.

---

## Checklist de teste antes de mandar para amigos
- [ ] Duas contas no mesmo ambiente: o item adicionado por uma aparece na outra em segundos.
- [ ] Riscar desce o item; a categoria toda riscada recolhe e vai para o fim.
- [ ] Convite pelo WhatsApp abre o app e entra no ambiente.
- [ ] Removido perde o acesso e não volta pelo link; "Readmitir" funciona.
- [ ] Sem internet: o app não trava e avisa (avalie cache offline depois).
- [ ] "Excluir minha conta" funciona.
- [ ] Sugestão enviada aparece na sua caixa de entrada; ao marcar como feita, quem enviou vê "Você sugeriu, nós fizemos".
- [ ] Com "Não, obrigado" na tela de privacidade, nenhum evento chega ao Firebase (confira no DebugView).
- [ ] Nas gravações do Clarity, os textos dos itens e os nomes aparecem mascarados.

---

## Progresso

### 26/10/2026 — Passo 2 + empacotamento + build na nuvem
Feito sem Android Studio: o APK sai só pelo GitHub Actions.

- **Projeto web (Passo 2):** Vite + JS puro. `index.html`, `src/styles.css` e módulos em `src/` (`ui`, `categorias`, `sugestoes`, `ambientes`, `voz`, `dados`, mais `estado`, `icones` e `main`). O código foi copiado da referência linha a linha, só com `import`/`export`. SortableJS e fontes Geist/Geist Mono pelo npm. Roda no modo local (`window.claude` ausente). `npm run build` sem erros; conferido no navegador: criar lista, dividir frase em itens, categorias automáticas, riscar (pausa e desce), categoria toda riscada recolhe, "Compra finalizada", Enter/Backspace nos itens, categoria escolhida na mão ensina o app.
- **Capacitor Android (parte do Passo 6):** `br.com.listadafeira`, "Lista da Feira", webDir `dist`, fundo `#0a0a0b`. Botão Voltar: fecha a folha aberta; senão volta da lista para a tela inicial; na tela inicial sai do app. Ícone, splash e status bar ainda não foram ajustados.
- **Assinatura:** `android/app/build.gradle` lê `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` e `KEY_PASSWORD` do ambiente; `versionCode` vem de `VERSION_CODE` (número da execução no CI).
- **GitHub Actions:** `gerar-keystore.yml` (manual, gera a keystore e publica por 1 dia) e `android.yml` (a cada push na main: APK de release assinado se os 4 segredos existirem, senão APK de debug; artefato `lista-da-feira`).
- **Diferenças da referência:** o aviso do botão de voz dizia "Aqui no Claude, use o microfone do teclado…" e passou a dizer "Use o microfone do teclado para ditar." (o ditado nativo vem no Passo 8.5). "Membros" no modo local dava erro de script (também na referência) e agora mostra "No modo local não há membros.". O convite ainda fala do Claude e aponta para o link do artefato; isso muda no Passo 5.

Próximo: Passo 1 (Supabase) e Passo 3 (camada de dados).

### 26/10/2026 — Distribuição de testes pelo Firebase App Distribution
- `android.yml` agora, em push na main e só se `FIREBASE_APP_ID` e `FIREBASE_SERVICE_ACCOUNT` existirem, envia o APK ao grupo `amigos` (ação `wzieba/Firebase-Distribution-Github-Action@v1.7.1`). Sem os segredos, o passo é pulado com um aviso, sem falhar. Notas da versão: a mensagem do último commit.
- Versão automática: `versionCode` = número da execução e `versionName` = `0.1.<execução>` (variáveis `VERSION_CODE` e `VERSION_NAME`), para cada build instalar por cima do anterior.
- Assinatura: com os 4 segredos da keystore, todo build é release assinado com a mesma chave. Sem eles, o log mostra um aviso: o APK de debug usa uma chave que muda a cada execução e os testadores não conseguem atualizar por cima (precisam desinstalar antes).
- Sem mudanças na interface. `google-services.json` fica para o Passo 8 (Analytics).

- Segredos da keystore de release (KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD) configurados: os builds agora saem assinados com a chave de release fixa.

- Áreas seguras no Android (barra de status cortando o topo): `MainActivity` agora desenha edge-to-edge igual no Android 13-15 e afasta o app das barras e do teclado com padding; `SystemBars.insetsHandling` = `disable` no `capacitor.config.json` (o WebView recebe env() = 0, sem espaço em dobro); o CSS usa `--safe-top/bottom/left/right` definidas uma vez em `:root` (FAB, barra de adicionar, sheets, toast e a tira do topo). Testado só pelo build; falta conferir no aparelho.
