# ADR-008 — Rate limits em camadas para autenticação

- **Status:** accepted
- **Data:** 2026-08-12
- **Decisores:** equipe responsável pelo produto e plataforma
- **Escopo:** login e cadastro por senha do Mend, Supabase Auth e superfície web de autenticação

## Contexto

Login e cadastro são endpoints públicos e podem receber tentativas repetidas,
cliques duplicados ou automação. O Mend usa o Supabase Auth diretamente no
navegador, portanto um limite apenas em React não protege o provedor nem o
projeto em produção.

## Decisão

Aplicar duas camadas complementares:

1. O Supabase Auth permanece autoritativo. O baseline local configura 15
   requisições de sign-in/sign-up por IP em cinco minutos e pelo menos 60
   segundos entre e-mails de confirmação ou recuperação.
2. O cliente compartilha `AUTH_RATE_LIMIT_POLICY` entre login e cadastro por
   senha, permitindo cinco tentativas em cinco minutos e bloqueando novas
   tentativas por mais cinco minutos. Essa camada é apenas anti-spam de UX,
   falha aberta se o storage não puder ser usado e não é um limite de
   segurança.
3. Respostas `429` do Supabase têm prioridade sobre a mensagem local e são
   apresentadas sem sinalizar credenciais incorretas.

Os limites de produção devem ser replicados no projeto Supabase remoto via
Auth/Management API após revisão. O `config.toml` local não deve ser enviado
cegamente com `supabase config push`, porque também contém URLs de
desenvolvimento.

## Consequências

### Benefícios

- reduz spam imediato e chamadas duplicadas;
- mantém o provedor como autoridade real do bloqueio;
- evita divergência entre login e cadastro;
- mantém o erro compreensível e visualmente estável.

### Custos e riscos

- o contador local pode ser apagado ou contornado, por desenho;
- limites por IP do provedor podem afetar redes compartilhadas;
- a configuração de produção precisa ser conferida separadamente da local.

### Operação e migração

- revisar os limites no Supabase Auth antes de cada ambiente produtivo;
- monitorar respostas HTTP 429 e ajustar somente com evidência de abuso ou
  falso positivo;
- considerar CAPTCHA/Turnstile se o abuso persistir.

## Alternativas rejeitadas

- **Somente localStorage:** não é uma fronteira de segurança e pode ser
  removido pelo cliente.
- **Somente middleware do app:** o fluxo atual chama Supabase Auth diretamente,
  e um proxy obrigatório ampliaria o escopo sem necessidade.
- **Limite agressivo por conta:** permite enumeração e pode bloquear usuários
  legítimos; o baseline usa IP no provedor.

## Evidências

- `src/shared/auth-rate-limit.ts`
- `src/components/AuthGate.tsx`
- `supabase/config.toml`
- `src/shared/auth-rate-limit.test.ts`

## Revisão

Revisar quando o fluxo de autenticação passar por um backend próprio, quando as
métricas mostrarem abuso persistente ou quando a taxa de falsos positivos
afetar sign-in/cadastro legítimos.
