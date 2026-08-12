# Resend para e-mails do Mend

O cadastro e o magic link usam o Supabase Auth diretamente. Portanto, instalar
Resend apenas no frontend ou no Express não envia esses e-mails; o SMTP do
Supabase Auth precisa usar o relay do Resend.

## Configuração

1. No Resend, crie uma API key e verifique o domínio que será usado como
   remetente.
2. No projeto Supabase `uwhugsimhtjtrnuotuki`, abra **Authentication → Email →
   SMTP Settings** e use:
   - host: `smtp.resend.com`;
   - port: `465`;
   - username: `resend`;
   - password: a API key do Resend;
   - sender email: um endereço do domínio verificado;
   - sender name: `Mend`.
3. Depois de salvar e testar o envio, configure
   `VITE_MEND_AUTH_EMAIL_DELIVERY_READY=1` no build do Mend. Enquanto estiver
   ausente ou em `0`, o cadastro por e-mail e o magic link são interrompidos
   antes de chamar o Supabase; a UI informa que nada foi enviado.

O bloco equivalente para desenvolvimento local está comentado em
`supabase/config.toml` e usa `RESEND_API_KEY` por referência de ambiente. Nunca
grave a API key no repositório ou em variáveis `VITE_*`.

## Contrato da UI

`session: null` após `signUp` significa que a confirmação é necessária, não que
uma mensagem foi entregue. O Mend só exibe o estado de confirmação quando o
deployment declara o SMTP pronto; erros estruturados de entrega viram um erro
de envio, sem botão “Abrir Gmail”.

Referências: [Resend SMTP](https://resend.com/docs/send-with-supabase-smtp) e
[segurança de senhas do Supabase](https://supabase.com/docs/guides/auth/password-security).
