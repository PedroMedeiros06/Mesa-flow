-- Limpeza do banco do sistema antigo (Pedidos_App). Rodar UMA vez no SQL Editor do Supabase.
-- Apaga de vez: 12 tabelas, 4 funções e 2 tipos do schema public, e os usuários de login
-- que não pertencem ao MesaFlow novo. Não toca no schema "app" (sistema novo).
begin;

drop table if exists
  public.activity_log,
  public.admin_users,
  public.catalog_item_images,
  public.catalog_item_ingredients,
  public.catalog_items,
  public.categories,
  public.companies,
  public.ingredients,
  public.members,
  public.order_items,
  public.orders,
  public.plans
cascade;

drop function if exists public.auth_company_id() cascade;
drop function if exists public.auth_member_access() cascade;
drop function if exists public.get_admin_login_email(text) cascade;
drop function if exists public.get_login_email(text, text) cascade;

drop type if exists public."Subscriptions" cascade;
drop type if exists public.members_access cascade;

delete from auth.users
where id not in (
  select auth_user_id from app.members
  union
  select auth_user_id from app.platform_admins
);

commit;

-- Conferência: esperado 0, 0, (nº de usuários do sistema novo), 3
select 'tabelas public' as item, count(*) from information_schema.tables where table_schema = 'public'
union all select 'funcoes public', count(*) from information_schema.routines where routine_schema = 'public'
union all select 'usuarios auth', count(*) from auth.users
union all select 'tabelas app', count(*) from information_schema.tables where table_schema = 'app';
