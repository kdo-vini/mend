# Mend já veste o estilo certo, falta acabamento

O Mend pertence à família "minimalista moderna" dos helpdesks atuais, a de Linear, Plain, do Front pós-2025 e dos componentes novos do Chatwoot: Inter na interface, acento azul único, três painéis e uma barra lateral recolhível. O que o diferencia é a camada "Céu e Profundo": canvas azul-acinzentado com brilhos, barra lateral de vidro flutuante e raios grandes (22–24px), algo que nenhum concorrente pesquisado usa no espaço de trabalho do agente. A recomendação é **manter as fontes atuais** (Inter para a interface, Geist para títulos, JetBrains Mono para identificadores) e **não trocar de paleta**: basta refinar o tema escuro "Noite" em direção a um azul-marinho mais profundo e menos saturado, a direção A deste relatório. Assim o Mend segue a lição do redesenho do Linear e corrige duas falhas de contraste que existem hoje sem violar o `DESIGN.md`. Graphite, teal e índigo foram avaliadas e ficam como alternativas descartadas, porque quebram decisões fechadas do design. A barra lateral recolhida está quebrada por uma razão geométrica simples. O trilho tem 58px, sobram 40px de conteúdo, e o CSS mantém duas linhas horizontais (logo + hambúrguer com cerca de 69px, três ícones de rodapé com cerca de 94px) que transbordam pelas duas bordas. A correção é alargar o trilho para 72px, empilhar essas linhas na vertical e devolver nomes acessíveis aos links. Mockups visuais acompanham este relatório.

## Nove concorrentes, quatro famílias de estilo

Os helpdesks pesquisados se dividem em dois campos tipográficos e quatro famílias visuais. O campo **corporativo** usa a pilha de fontes do sistema com corpo de 14px numa grade de 4px. O Zendesk Garden declara `system-ui, -apple-system, "Segoe UI", Roboto…` com tamanho base de 14px e raios de 2/4/8px ([Garden theme](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/theme/index.js)). O Freshdesk (Crayons) usa pilha semelhante e texto azul-marinho `#12344d` ([Crayons CSS](https://unpkg.com/@freshworks/crayons@4/css/crayons-min.css)). O campo **moderno** usa Inter. O Linear adotou **Inter Display para títulos e Inter no corpo** no redesenho de 2024 ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)), e o Chatwoot define as famílias `inter` e `interDisplay` no Tailwind ([chatwoot tailwind.config.js](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/tailwind.config.js)). Um episódio do Intercom mostra que agentes percebem detalhes de fonte. Em janeiro de 2025 a empresa reverteu uma troca de fonte na inbox depois de reclamações de que o zero pontilhado parecia um 8 ([Intercom Community](https://community.intercom.com/intercom-community-27/intercom-inbox-new-font-8933)).

No acento, o azul domina: Zendesk `#1f73b7` ([Garden palette](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/palette/index.js)), Freshdesk `#2c5cc5` e Chatwoot `#2781F6` ([chatwoot colors.js](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/theme/colors.js)). O Linear foi na direção oposta e **reduziu quanto azul alimenta a paleta**, gerando temas em LCH a partir de três variáveis (base, acento, contraste) em vez de 98 ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). Os temas escuros variam entre o quase-preto azulado do Zendesk (`#151a1e`, elevado `#1c2227`) e o cinza frio Radix slate do Chatwoot. O modo escuro do Front, lançado no redesenho de 2025, foi criticado por baixo contraste ([Front community](https://community.front.com/product-updates/boost-productivity-and-focus-with-a-new-reimagined-inbox-2812); [Macha](https://www.getmacha.com/blog/new-front-redesign-explained)). O Plain tem modo escuro que segue o sistema desde março de 2023 ([Plain changelog](https://www.plain.com/changelog/dark-mode)).

| Produto | Fonte da interface | Acento | Modo escuro | Layout | Família |
|---|---|---|---|---|---|
| Zendesk | Pilha do sistema, 14px ([fonte](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/theme/index.js)) | Azul `#1f73b7` | Sim, cinza-azulado `#151a1e` | 3 painéis + trilho fixo | Corporativo denso |
| Freshdesk | Pilha do sistema ([fonte](https://unpkg.com/@freshworks/crayons@4/css/crayons-min.css)) | Azul `#2c5cc5` | Não confirmado | 3 painéis | Corporativo denso |
| HubSpot | Marca em Lexend Deca; produto em pilha do sistema (não verificado) | Laranja (não verificado) | Não confirmado | 3 painéis | Corporativo denso |
| Intercom | Fonte própria, relatada como Saans (não verificado) | Azul (não verificado) | Não confirmado | 3 painéis, layout unificado | Amigável / marca forte |
| Help Scout | Não confirmada | Não confirmado | Não confirmado | "Inbox 2" mais focada ([fonte](https://docs.helpscout.com/article/1537-whats-new-with-the-inbox)) | Amigável / marca forte |
| Front | Não confirmada | "Cores mais calmas" ([fonte](https://front.com/blog/the-new-front-inbox)) | Sim, criticado | Barra lateral recolhível + lista + conversa + painel | Minimalista moderno (2025) |
| Plain | Não confirmada (aparência de Inter) | Não confirmado | Sim, segue o sistema | Fila e conversa fundidas | Minimalista moderno |
| Linear (referência) | Inter + Inter Display | Quase neutro | Sim, quase-preto (relatado `#08090a`) | Barra lateral densa | Minimalista moderno |
| Chatwoot | Sistema / Inter / Inter Display | Azul `#2781F6` | Sim, Radix slate | Barra redimensionável e recolhível + 3 painéis | Open source / chat |
| **Mend** | **Inter 13px + Geist nos títulos** | **Azul `#2468d8` / `#2e7dff`** | **Sim, azul-marinho "Noite" `#101b2a`** | **Vidro flutuante + 3 painéis num cartão** | **Minimalista moderno com vidro** |

Os três painéis (lista, conversa, contexto) são padrão em todos. O Front descreve barra lateral, lista com "apenas detalhes essenciais", conversa e painel de integrações ([Front](https://front.com/blog/the-new-front-inbox)). As diferenças estão na densidade e no tratamento das superfícies. Nenhuma fonte primária mostrou uso relevante de vidro ou desfoque no espaço de trabalho do agente. O único efeito encontrado foi o degradê sutil no rodapé da barra lateral do Chatwoot ([Sidebar.vue](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/javascript/dashboard/components-next/sidebar/Sidebar.vue)). Faltam dados primários de fonte e cor para Intercom, Help Scout, Plain e HubSpot. As células marcadas como "não verificado" ou "não confirmado" são as lacunas reais da pesquisa.

## O Mend é um Chatwoot com a disciplina do Linear e uma camada de vidro

O parente mais próximo do Mend é o **Chatwoot**: Inter, azul como único acento, controles arredondados, bordas de 1px, barra lateral recolhível com alvos de 32px e foco em conversas de chat ou WhatsApp ([tailwind config](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/tailwind.config.js)). A filosofia de tema, porém, está mais perto do **Linear**. O `DESIGN.md` define o Mend como "uma sala de controle silenciosa", com uma ação primária por tela, densidade calma e um único bloco Profundo por tela ([DESIGN.md:8-35](../DESIGN.md)). É a mesma contenção que levou o Linear a reduzir o azul na interface.

Três escolhas tiram o Mend da média. A primeira é o **vidro**: a barra lateral usa `backdrop-filter: blur(24px) saturate(1.3)` ([workspace-design.css:23](../src/styles/workspace-design.css)), e as barras de ferramentas e menus usam `blur(20px)`. A segunda são os **raios grandes** (`--radius-feature: 22px`, `--radius-shell: 24px` em [tokens.css:128-134](../src/styles/tokens.css)), contra 2–8px no Zendesk e no Freshdesk. A terceira é a **inbox inteira dentro de um cartão opaco arredondado** flutuando sobre um canvas com brilhos ([prototype-inbox-shell.css:1-26](../src/styles/prototype-inbox-shell.css)), enquanto a maioria dos helpdesks usa painéis de ponta a ponta separados por linhas finas. O `DESIGN.md` já limita o vidro à navegação e proíbe vidro sob dados ([DESIGN.md:64-72](../DESIGN.md)). Isso coincide com a orientação da NN/g de usar glassmorphism "com moderação" e checar o contraste contra todo fundo possível ([NN/g](https://www.nngroup.com/articles/glassmorphism/)). O Mend não precisa abandonar a assinatura. Precisa garantir que ela continue restrita ao "cromo".

Uma ressalva de escopo: a estratégia histórica exclui "substituição completa de Intercom ou Zendesk" ([MEND_PRODUCT_STRATEGY_V1.md:547-560](../docs/product/MEND_PRODUCT_STRATEGY_V1.md)), e a direção interna atual exige interface "alinhada ao design existente" ([MEND_INTERNAL_PRODUCT_DIRECTION.md:29](../docs/product/MEND_INTERNAL_PRODUCT_DIRECTION.md)). Copiar padrões visuais de helpdesk para a inbox está dentro do escopo. Copiar o conjunto de funcionalidades deles não está.

## Inter fica; o "Noite" precisa descer um tom

### Tipografia: nenhuma troca supera o trio atual

O Mend já hospeda localmente Inter, Geist e JetBrains Mono variáveis ([fonts.css:2-22](../src/styles/fonts.css)), e o `DESIGN.md` fixa Geist apenas para títulos e marca, Inter para o resto e JetBrains Mono para identificadores reais ([DESIGN.md:88-94](../DESIGN.md)). As medições feitas nos arquivos do Google Fonts confirmam a escolha. **Inter tem a maior altura-x entre as sem serifa candidatas (0,546)**, tem `tnum` e um eixo óptico `opsz 14-32` que gera o corte Display sozinho ([rsms.me/inter](https://rsms.me/inter/); [Google Fonts metadata](https://fonts.google.com/metadata/fonts)). Manrope (0,540) e Plus Jakarta Sans (0,536) são legíveis, mas mais redondas e largas, e puxariam o tom para "SaaS amigável". DM Sans (0,504) e Figtree (0,500) precisariam de 0,5–1px a mais para parecer do mesmo tamanho, o que prejudica a densidade. A DM Sans servida pelo Google também não tem `tnum`. Todas as candidatas cobrem os diacríticos do pt-BR, então o idioma não desempata.

Duas melhorias custam pouco. Contadores, SLAs e badges devem usar `font-variant-numeric: tabular-nums` em Inter, não fonte monoespaçada. O caso do Intercom mostra que dígitos ambíguos incomodam. Além disso, o CSS mistura `JetBrains Mono`, `var(--font-mono)`, `var(--mono)` e `ui-monospace, SFMono-Regular, Menlo` (observado em `src/styles/features/settings.css`), e vale consolidar tudo em `--font-technical`. Trocar Geist por Inter Display eliminaria um arquivo de fonte, mas mudaria uma decisão fechada do `DESIGN.md` em troca de ganho marginal. Não recomendo.

### Paleta: quatro direções para o tema escuro, ranqueadas

O tema claro "Céu" não tem problema identificado e deve ficar como está. A discussão é sobre o "Noite". Hoje ele usa canvas `#101b2a`, superfície `#1b2b40` e seleção `#314a69` ([tokens.css:40-66](../src/styles/tokens.css)). O texto primário passa com folga (14,3:1 no canvas e 7,5:1 na seleção), mas **o texto de ação `#75a7ff` cai para 3,77:1 sobre a linha selecionada e reprova no AA para texto de corpo**. A superfície `#1b2b40` é clara e saturada, e é ela que dá o aspecto "azulado e vítreo". Os contrastes abaixo foram calculados com a fórmula de luminância relativa da WCAG 2.x. O mínimo é 4,5:1 para texto e 3:1 para bordas de componentes ([W3C 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); [W3C 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). As paletas são construções próprias, ancoradas nas escalas Radix ([Radix](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)) e nos tokens atuais do Mend. Não foram copiadas de nenhum produto.

| Token | **A. Marinho refinado (recomendada)** | B. Grafite neutro | C. Teal | D. Índigo |
|---|---|---|---|---|
| canvas | `#0b1420` | `#111113` | `#0c1514` | `#0e0f1c` |
| superfície | `#101b2a` | `#18191b` | `#111c1b` | `#141627` |
| elevada | `#16233a` | `#212225` | `#172826` | `#1b1e33` |
| selecionada | `#1d2d47` | `#272a2d` | `#1d322f` | `#232741` |
| borda / forte | `#22324a` / `#33465f` | `#2e3135` / `#43484e` | `#22403b` / `#2f5650` | `#2a2e4a` / `#3c4166` |
| texto / 2 / suave | `#e6edf6` / `#a9b8cb` / `#8193a8` | `#edeef0` / `#b0b4ba` / `#8b9098` | `#e3f1ee` / `#a4bfba` / `#7f9d97` | `#e8e9f6` / `#b0b3cf` / `#8a8eae` |
| acento texto / preenchimento | `#7cb0ff` / `#2563eb` | `#70b8ff` / `#0b6fd6` | `#2fd6bd` / `#0f766e` | `#a5b4fc` / `#4f46e5` |
| sucesso / alerta / perigo / IA | `#4cc38a` / `#e8b14a` / `#f2666f` / `#b49cff` | `#3dd68c` / `#ffca16` / `#ff9592` / `#baa7ff` | `#5ad18a` / `#f0b54a` / `#ff8a85` / `#b49cff` | `#4cc38a` / `#f0b54a` / `#ff8a8a` / `#5eead4` |
| Texto na superfície | 14,69:1 | 15,15:1 | 15,00:1 | 14,84:1 |
| Acento na superfície | 7,85:1 | 8,37:1 | 9,52:1 | 8,97:1 |
| Branco no preenchimento | 5,17:1 | 4,93:1 | 5,47:1 | 6,29:1 |
| Ponto fraco | Suave na seleção 4,39:1 | Suave na seleção 4,49:1; perde o marinho | Choca com sucesso e WhatsApp | Preenchimento vs. superfície 2,85:1; IA perde o violeta |

**1º lugar: A, marinho refinado.** É a única direção que preserva a identidade Céu e Profundo exigida pelo `DESIGN.md`. A mudança prática é escurecer e dessaturar a superfície (o canvas atual `#101b2a` vira a superfície) e encurtar os degraus de elevação para cerca de 1,06–1,12:1, como recomenda a lógica de elevação em LCH do Linear ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). O acento `#7cb0ff` substitui `#75a7ff` com 7,85:1 na superfície. Ainda é preciso clarear o texto suave para cerca de `#8b9cb1` para passar na linha selecionada, ou restringi-lo a canvas, superfície e elevada. O preenchimento `#2563eb` fica a 3,35:1 da superfície e atende o mínimo de 3:1 para não-texto. O Profundo (`--deep: #16375c`) continua invariante entre temas e ganha destaque sobre o canvas mais escuro.

**2º lugar: B, grafite.** É a mais "ferramenta profissional": os chips de canal e as cores de estado sobressaem sobre o cinza neutro. O custo é abrir mão do azul-marinho, o que fere "uma céu, um profundo" e o banimento dos estágios quase-pretos do antigo "Solaris" ([DESIGN.md:8-23](../DESIGN.md)). Só faz sentido se o usuário revogar essa decisão explicitamente. Atenção: o Radix blue-9 `#0090ff` com texto branco dá só 3,26:1, então o preenchimento precisa ser `#0b6fd6`.

**3º lugar: C, teal.** Amarra a marca a um canal. O verde do WhatsApp `#25D366` com texto branco dá 1,98:1 e só serve como ícone ou chip, e o teal disputa espaço com "sucesso" e com o próprio chip do WhatsApp. **4º lugar: D, índigo.** Coloca o acento no matiz que a maioria dos produtos usa para IA, o que obriga o estado de IA do cabeçalho da inbox a migrar para teal. O preenchimento contra a superfície fica abaixo de 3:1.

Duas regras valem para qualquer direção. Primeiro, bordas sutis de cerca de 1,35:1 servem para divisórias, não para contorno de inputs: esse papel é do `--line-control`. Segundo, o contraste de superfícies de vidro tem de ser medido sobre o fundo composto, não sobre o token com alfa. Nenhuma das razões acima considera o vidro.

## Barra lateral recolhida: 58px para conteúdo de 94px

O trilho recolhido é definido em `.sidebar-is-collapsed .sidebar { width: 58px; flex-basis: 58px; padding: 13px 8px; }` ([shared.css:265-269](../src/styles/shared.css)), com `box-sizing: border-box` global ([base.css:1-3](../src/styles/base.css)) e 1px de borda de vidro ([workspace-design.css:11-28](../src/styles/workspace-design.css)). **A área útil é 58 − 16 − 2 = 40px.** Como `.sidebar` não tem `overflow: hidden`, tudo o que excede é pintado fora da borda arredondada. A estimativa de "~90px" do usuário provavelmente soma a margem externa de 16px ao transbordamento visível. As posições foram calculadas a partir do CSS e não medidas no navegador.

O primeiro defeito está no logo e no hambúrguer. `.sidebar-is-collapsed .brand-row` só centraliza e mantém a linha horizontal ([shared.css:270-273](../src/styles/shared.css)). Somente o texto da marca é escondido ([shared.css:274-283](../src/styles/shared.css)), e o botão `.sidebar-collapse` continua com `margin-left: auto` ([shell.css:71-73](../src/styles/shell.css)). A conta é marca de 28px ([shell.css:39-46](../src/styles/shell.css)) + espaço de 11px + botão de 30px ([primitives.css:94-105](../src/styles/primitives.css)) = **69px em 40px**, cerca de 14px para fora de cada lado. Abaixo de 820px a regra responsiva esconde o `.sidebar-collapse` ([responsive.css:37-57](../src/styles/responsive.css)). Por isso o trilho estreito parece correto em telas menores, mas lá não há como expandi-lo.

O segundo defeito é o mais visível. `.sidebar-utilities` é `display: flex` com `gap: 2px` e não muda de direção quando recolhido ([shell.css:176-180](../src/styles/shell.css)). Com `.sidebar-bottom-header` centralizado ([shared.css:289-292](../src/styles/shared.css)), **sino, tema e sair (3 × 30 + 2 × 2 = 94px) transbordam cerca de 27px de cada lado**: o sino fica sobre a borda esquerda e o botão de sair sobre a direita. O badge de notificação (`top: -3px; right: -3px`, [primitives.css:132-144](../src/styles/primitives.css)) piora o transbordamento. O avatar centralizado sozinho ([shared.css:280-301](../src/styles/shared.css)) está correto. Só parece órfão porque a linha de cima está quebrada.

O terceiro defeito é de acessibilidade. Os `NavLink`s renderizam ícone + `<span>` ([WorkspaceShell.tsx:348-357](../src/app/shell/WorkspaceShell.tsx)), e o CSS recolhido esconde o span com `display: none` ([shared.css:279](../src/styles/shared.css)). Isso **remove o nome acessível** dos links e do botão de busca, o que viola "todo controle tem nome acessível" ([DESIGN.md:117](../DESIGN.md)). O repositório também não tem componente de Tooltip. Há ainda dívida estrutural. As regras recolhidas duplicam o bloco `@media (max-width: 820px)` de [responsive.css:37-76](../src/styles/responsive.css) e [shell.css:394-419](../src/styles/shell.css), e as cópias já divergiram. O estado `useState(false)` em [App.tsx:220](../src/App.tsx) não é persistido, ao contrário de `mend.theme`. Por fim, o `padding-top: 25px` de `workspace-design.css` sobrescreve os 13px do estado recolhido porque tem a mesma especificidade e é carregado depois.

### Correção proposta (não aplicada)

O alvo é um trilho de **72px**, que segue a grade de 4px e deixa 46px úteis para alvos de 40px. Esse padrão é o mesmo do Chatwoot (alvos quadrados, itens centralizados, perfil no rodapé) ([Sidebar.vue](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/javascript/dashboard/components-next/sidebar/Sidebar.vue)). O seletor `.app-shell.sidebar-is-collapsed` (especificidade 0,3,0) vence também o `workspace-design.css`:

```css
.app-shell.sidebar-is-collapsed .sidebar {
  width: 72px; flex-basis: 72px;
  padding: 20px 12px 12px;
  align-items: center;
}
.app-shell.sidebar-is-collapsed .brand-row {
  flex-direction: column; gap: var(--space-3); padding: 0 0 var(--space-3);
}
.app-shell.sidebar-is-collapsed .sidebar-collapse { margin-left: 0; }
.app-shell.sidebar-is-collapsed .sidebar-bottom-header { min-height: 0; }
.app-shell.sidebar-is-collapsed .sidebar-utilities {
  flex-direction: column; gap: var(--space-1);
}
.app-shell.sidebar-is-collapsed :is(.sidebar-utilities .icon-button, .nav-item, .command-trigger) {
  width: 40px; height: 40px; min-height: 40px; padding: 0; justify-content: center;
}
```

No JSX de `WorkspaceShell.tsx`, a correção adiciona `aria-label` e `title` condicionais (`collapsed ? label : undefined`) a cada `NavLink` e ao `.command-trigger`, e `title` aos botões de sino, tema e sair. Também troca o ícone `Menu` por `PanelLeftClose`/`PanelLeftOpen`. Uma variante mais enxuta, no estilo Linear e Notion, mostra só o botão de alternância no lugar da marca quando recolhido, ou troca a marca pelo ícone no hover e no foco. Outra opção é mover tema e sair para o popover de `WorkspaceAvailability`, deixando no rodapé apenas sino e avatar. Se a solução de tooltip virar componente, ele deve entrar em `docs/engineering/catalog.md`. Complementos: persistir o estado em `localStorage` como `mend.sidebar-collapsed`, com try/catch; unificar as regras recolhidas num único seletor compartilhado com a media query de 820px; e adicionar um teste Playwright em 1440×900 que recolhe a barra e verifica que toda caixa `.sidebar *` fica dentro da caixa de `.sidebar`. `overflow-x: clip` só deve ser usado depois de levar o popover de disponibilidade, hoje posicionado de forma absoluta dentro do trilho ([shell.css:232-244](../src/styles/shell.css)), para um portal. Sem isso o popover seria cortado. A revisão final deve seguir o checklist do `DESIGN.md`: 1440×900 e 390×844 nos dois temas.

## Conclusão

A comparação inverte a pergunta inicial. O Mend não precisa se parecer mais com um helpdesk. Ele já está na família visual mais atual do mercado, e o que o separa dos concorrentes (vidro, raios grandes, Profundo) é exatamente o que o `DESIGN.md` protege. Os problemas reais são de execução: um tema escuro com superfícies claras e saturadas demais, um acento que reprova na linha selecionada e um trilho recolhido que nunca foi desenhado para seu próprio tamanho. Os três se resolvem dentro das regras existentes, sem decisão de marca nova.

O ponto que fica em aberto é governança. As regras do estado recolhido divergiram da cópia responsiva, os valores de desfoque estão fixos no código em vez de usar o token `--glass-blur`, e o CSS de funcionalidades ainda tem hex e quatro nomes para a fonte monoespaçada. Gerar o "Noite" a partir de poucos tokens base, como o Linear faz com base, acento e contraste, evitaria que a próxima correção de contraste precise caçar valores em vários arquivos. **Mockups** do tema refinado e do trilho recolhido de 72px acompanham este relatório.
