import type { ReactNode } from "react";
import { Link } from "react-router";
import { Marca } from "@/ui/componentes";
import "./legal.css";

/**
 * Textos-base de Termos de uso e Política de privacidade.
 * ATENÇÃO: rascunho para revisão de um advogado antes de vender. Os campos entre colchetes
 * (razão social, CNPJ, endereço, e-mail) precisam ser preenchidos com os dados reais da empresa.
 */
const EMPRESA = "[RAZÃO SOCIAL DA EMPRESA]";
const CNPJ = "[CNPJ]";
const ENDERECO = "[ENDEREÇO COMPLETO]";
const CONTATO = "[E-MAIL DE CONTATO]";
const ATUALIZADO = "[DATA DA ÚLTIMA ATUALIZAÇÃO]";

function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="legal">
      <header className="legal-topo">
        <Marca />
      </header>
      <article>
        <h1>{titulo}</h1>
        <p className="legal-rascunho" role="note">
          Texto-base em revisão. Os trechos entre colchetes ainda serão preenchidos com os dados da empresa.
        </p>
        <p className="suave">Última atualização: {ATUALIZADO}</p>
        {children}
      </article>
      <footer className="legal-rodape suave">
        <Link to="/termos">Termos de uso</Link>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/">MesaFlow</Link>
      </footer>
    </main>
  );
}

export function Termos() {
  return (
    <Pagina titulo="Termos de uso">
      <p>
        Estes termos valem para o uso do MesaFlow, sistema para restaurantes oferecido por {EMPRESA}, CNPJ {CNPJ}, com
        sede em {ENDERECO} (“nós”). Quem contrata o MesaFlow é o restaurante (“cliente”); quem usa o painel é a equipe do
        restaurante; quem faz pedidos pelo cardápio online ou pelo QR da mesa é o consumidor do restaurante.
      </p>

      <h2>1. O que é o serviço</h2>
      <p>
        O MesaFlow organiza pedidos de balcão, mesas e comandas, cozinha, cardápio online, estoque e equipe do
        restaurante, pela internet. O acesso é por assinatura mensal, no plano combinado na contratação.
      </p>

      <h2>2. Cadastro e acesso</h2>
      <ul>
        <li>O restaurante é cadastrado por nós, com os dados informados pelo dono.</li>
        <li>
          Cada pessoa da equipe entra com o código do restaurante, o próprio CPF e a própria senha. A senha é pessoal:
          não compartilhe.
        </li>
        <li>
          O dono (ou quem ele autorizar) decide o que cada pessoa da equipe pode fazer e é responsável pelo que a equipe
          faz no sistema.
        </li>
      </ul>

      <h2>3. Responsabilidades do restaurante</h2>
      <ul>
        <li>Manter preços, cardápio e estoque corretos. O sistema calcula a partir do que o restaurante cadastra.</li>
        <li>
          Cumprir as leis que valem para o seu negócio, inclusive as de defesa do consumidor, de emissão de nota fiscal e
          de proteção de dados dos seus clientes. O MesaFlow não emite nota fiscal.
        </li>
        <li>Não usar o sistema para nada ilegal nem tentar acessar dados de outros restaurantes.</li>
      </ul>

      <h2>4. Pagamento, atraso e bloqueio</h2>
      <ul>
        <li>A mensalidade é cobrada conforme o plano e a forma de pagamento combinados.</li>
        <li>
          Com a mensalidade em atraso, podemos bloquear o acesso depois de avisar. O bloqueio não apaga nada: ao
          regularizar, o acesso volta como estava.
        </li>
      </ul>

      <h2>5. Disponibilidade</h2>
      <p>
        Trabalhamos para o sistema ficar no ar o tempo todo, mas ele depende de internet e de serviços de terceiros
        (hospedagem e banco de dados). Pode haver paradas para manutenção ou por falhas fora do nosso controle. Não
        respondemos por lucros cessantes causados por essas paradas, nos limites da lei.
      </p>

      <h2>6. Dados</h2>
      <p>
        Os dados do restaurante (cardápio, pedidos, clientes) são do restaurante. O tratamento de dados pessoais segue a{" "}
        <Link to="/privacidade">Política de privacidade</Link>.
      </p>

      <h2>7. Cancelamento</h2>
      <p>
        O restaurante pode cancelar quando quiser, avisando pelo {CONTATO}. A pedido, entregamos uma cópia dos dados
        antes de encerrar. Depois do cancelamento, os dados são apagados no prazo da Política de privacidade.
      </p>

      <h2>8. Mudanças nestes termos</h2>
      <p>Se mudarmos estes termos, avisamos o restaurante antes de a mudança valer.</p>

      <h2>9. Contato e foro</h2>
      <p>
        Dúvidas: {CONTATO}. Fica eleito o foro da comarca de [CIDADE/UF], salvo regra legal diferente para o caso.
      </p>
    </Pagina>
  );
}

export function Privacidade() {
  return (
    <Pagina titulo="Política de privacidade">
      <p>
        Esta política explica quais dados pessoais o MesaFlow trata, para quê e quais são os seus direitos, conforme a
        Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD). O MesaFlow é oferecido por {EMPRESA}, CNPJ {CNPJ}.
      </p>

      <h2>1. Quem decide sobre os dados</h2>
      <ul>
        <li>
          <strong>Dados da equipe e do dono do restaurante:</strong> o MesaFlow decide como tratar (controlador), para
          dar acesso ao sistema.
        </li>
        <li>
          <strong>Dados dos clientes do restaurante</strong> (quem pede pelo cardápio online): o restaurante é o
          controlador; o MesaFlow só guarda e processa esses dados para o restaurante (operador). Pedidos sobre esses
          dados devem ir primeiro ao restaurante.
        </li>
      </ul>

      <h2>2. Quais dados</h2>
      <ul>
        <li>
          <strong>Equipe do restaurante:</strong> nome, CPF (para entrar no sistema), e-mail, permissões e o registro do
          que cada pessoa fez em pedidos e comandas.
        </li>
        <li>
          <strong>Cliente que pede pelo cardápio online:</strong> nome, telefone, observações do pedido, itens pedidos e
          forma de pagamento escolhida.
        </li>
        <li>
          <strong>Cliente à mesa, pelo QR:</strong> nenhum dado pessoal é pedido. A página mostra só a conta da mesa.
        </li>
        <li>
          <strong>Dados técnicos:</strong> endereço IP, usado por pouco tempo para impedir abuso (por exemplo, pedidos em
          massa).
        </li>
      </ul>

      <h2>3. Para quê</h2>
      <ul>
        <li>Fazer o sistema funcionar: login, pedidos, cozinha, mesas, contas.</li>
        <li>Deixar o restaurante falar com o cliente sobre o pedido (por exemplo, pelo telefone informado).</li>
        <li>Segurança: impedir acesso indevido e abuso, e saber quem fez cada alteração.</li>
        <li>Cobrança da assinatura do restaurante.</li>
      </ul>
      <p>
        As bases legais são a execução do contrato com o restaurante, o legítimo interesse em manter o serviço seguro e
        o cumprimento de obrigações legais. Não vendemos dados pessoais e não usamos para propaganda.
      </p>

      <h2>4. Com quem compartilhamos</h2>
      <p>
        Só com quem precisa para o serviço funcionar: o provedor de banco de dados e login (Supabase) e o provedor de
        hospedagem [NOME DO PROVEDOR DE HOSPEDAGEM]. Esses serviços podem guardar dados em servidores fora do Brasil, com
        as garantias exigidas pela LGPD. Também compartilhamos quando a lei ou uma autoridade exigir.
      </p>

      <h2>5. Por quanto tempo</h2>
      <p>
        Enquanto o restaurante usa o MesaFlow. Depois do cancelamento, apagamos em até [PRAZO] dias, salvo o que a lei
        mandar guardar por mais tempo.
      </p>

      <h2>6. Cookies e armazenamento no aparelho</h2>
      <p>
        Não usamos cookies de propaganda nem de rastreamento. O navegador guarda só o necessário para funcionar: a sessão
        de quem entrou no painel, o código do restaurante para facilitar o próximo login e o carrinho do cardápio online.
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode pedir para confirmar se tratamos seus dados, acessar, corrigir, apagar, saber com quem foram
        compartilhados e retirar consentimento quando for o caso (art. 18 da LGPD). Peça pelo {CONTATO}. Se for cliente
        de um restaurante, procure também o próprio restaurante.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Usamos conexão criptografada, senhas guardadas pelo provedor de login (nunca em texto), separação dos dados de
        cada restaurante e permissões por pessoa. Se houver um incidente que traga risco, avisamos os afetados e a ANPD
        como a lei manda.
      </p>

      <h2>9. Encarregado (DPO)</h2>
      <p>
        Encarregado pelo tratamento de dados: [NOME DO ENCARREGADO], {CONTATO}.
      </p>
    </Pagina>
  );
}
