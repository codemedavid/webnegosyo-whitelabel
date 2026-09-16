const {PGlite}=require('@electric-sql/pglite')
const {readFileSync}=require('node:fs')
const assert=require('node:assert/strict')
async function main(){const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table menu_items(id uuid primary key,tenant_id uuid);
 create table order_types(id uuid primary key,tenant_id uuid);
 create table payment_methods(id uuid primary key,tenant_id uuid);
 create table orders(id uuid primary key default gen_random_uuid(),tenant_id uuid,customer_name text,customer_contact text,customer_data jsonb,total numeric,status text,payment_status text,order_type_id uuid references order_types,order_type text,payment_method_id uuid references payment_methods,payment_method_name text,created_at timestamptz);
 create table order_items(order_id uuid references orders,menu_item_id uuid references menu_items on delete set null,menu_item_name text,quantity integer,price numeric,subtotal numeric,variation text);`)
 const sql=readFileSync('supabase/migrations/20260914165000_loyalty_order_projection.sql','utf8')
 assert.ok(readFileSync('src/lib/loyalty/order-projection-schema.ts','utf8').includes(sql),'Tenant and platform projection contracts match')
 await db.exec(sql)
 const id='11111111-1111-4111-8111-111111111111'
 const receipt={source:'pos',phone:'+639171234567',totalCentavos:5000,customerData:{},orderTypeId:id,payment:{methodId:id},settledAt:'2026-09-14T00:00:00Z',items:[{menuItemId:id,name:'Coffee',quantity:1,unitPriceCentavos:10000,subtotalCentavos:10000}]}
 const project=async(value=receipt,settlement=id)=>(await db.query('select project_loyalty_pos_receipt($1,$2,$3) as id',[id,settlement,value])).rows[0].id
 const order=await project();assert.equal(await project(),order)
 assert.equal((await db.query('select * from orders')).rows[0].payment_status,'paid')
 assert.equal((await db.query('select * from order_items')).rows.length,1)
 assert.equal((await db.query('select * from order_items')).rows[0].menu_item_id,null,'Deleted catalog IDs do not strand a paid receipt')
 assert.equal((await db.query('select * from orders')).rows[0].order_type_id,null)
 assert.equal((await db.query('select * from orders')).rows[0].payment_method_id,null)
 await assert.rejects(project({...receipt,totalCentavos:1}),/differs/)
 await db.exec('create table order_payments(tenant_id uuid,order_id uuid,kind text,amount numeric,payment_method_id uuid,payment_method_name text,reference text,recorded_by uuid,outlet_id uuid,note text,created_at timestamptz default now())')
 await db.query("insert into order_payments(tenant_id,order_id,kind,amount) values($1,$2,'charge',50),($1,$2,'refund',10)",[id,order])
 const evidence=async()=> (await db.query('select read_loyalty_refund_evidence($1,$2) as value',[id,id])).rows[0].value
 assert.equal((await evidence()).refundedCentavos,1000,'Partial refund evidence is not a full refund')
 await db.query("insert into order_payments(tenant_id,order_id,kind,amount) values($1,$2,'refund',40)",[id,order])
 assert.equal((await evidence()).chargedCentavos,5000)
 assert.equal((await evidence()).refundedCentavos,5000)
 await db.exec(`create function fail_items() returns trigger language plpgsql as $$begin raise exception 'item failure';end$$;create trigger fail_items before insert on order_items for each row execute function fail_items()`)
 await assert.rejects(project(receipt,'22222222-2222-4222-8222-222222222222'),/item failure/)
 assert.equal((await db.query('select * from orders')).rows.length,1,'Line failure rolls the order back')
 await db.exec('drop trigger fail_items on order_items')
 const delayed=await project(receipt,'33333333-3333-4333-8333-333333333333')
 const paidAt=(await db.query('select created_at from order_payments where order_id=$1',[delayed])).rows[0].created_at
 assert.equal(Date.parse(paidAt),Date.parse(receipt.settledAt),'Projected tender belongs to the settlement day, not the projection day')
 await db.exec('set role authenticated');await assert.rejects(project(),/permission denied/)
 console.log('Loyalty destination projection SQL regressions passed')
}finally{await db.close()}}
main().catch(e=>{console.error(e.message);process.exitCode=1})
