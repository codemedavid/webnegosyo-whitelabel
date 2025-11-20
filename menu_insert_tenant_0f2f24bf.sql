-- =========================================================
-- TENANT: 0f2f24bf-d950-456e-8f86-4d2aa5087d29
-- SAFE SEED: NO duplicate categories or menu items
-- =========================================================

------------------------------------------------------------
-- 1) CATEGORIES (created only if missing)
------------------------------------------------------------

-- Main Dishes
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  'Main Dishes',
  'Main dishes and food items',
  '🍽️',
  0
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29' AND name = 'Main Dishes'
);

-- Drinks
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  'Drinks',
  'Beverages and drinks',
  '🍹',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29' AND name = 'Drinks'
);

-- Dessert
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  'Dessert',
  'Desserts and sweet treats',
  '🥭',
  2
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29' AND name = 'Dessert'
);

-- Fruits
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  'Fruits',
  'Fresh fruits',
  '🍊',
  3
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29' AND name = 'Fruits'
);

-- Sulit and Complete Combo
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  'Sulit and Complete Combo',
  'Value bundles and combo meals',
  '🎁',
  4
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29' AND name = 'Sulit and Complete Combo'
);

------------------------------------------------------------
-- 2) MAIN DISHES
------------------------------------------------------------
WITH main_cat AS (
  SELECT id FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
    AND name = 'Main Dishes'
  LIMIT 1
),
main_vals AS (
  SELECT *
  FROM (
    VALUES
      ('Boneless Bangus', 'Boneless Bangus', 160, 0),
      ('Steam Pork Siomai 20pcs', 'Steam Pork Siomai 20 pieces', 260, 1)
  ) AS v(name, description, price, order_index)
),
main_missing AS (
  SELECT v.*
  FROM main_vals v
  LEFT JOIN public.menu_items m
    ON m.tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
   AND m.name = v.name
  WHERE m.id IS NULL
)
INSERT INTO public.menu_items (
  tenant_id, category_id, name, description, price,
  image_url, variations, variation_types, addons,
  is_available, is_featured, "order"
)
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  c.id,
  v.name,
  v.description,
  v.price,
  'https://via.placeholder.com/800x600?text=' ||
    replace(replace(v.name, ' ', '+'), '''', '%27'),
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  TRUE, FALSE, v.order_index
FROM main_cat c
CROSS JOIN main_missing v;

------------------------------------------------------------
-- 3) DRINKS
------------------------------------------------------------
WITH drinks_cat AS (
  SELECT id FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
    AND name = 'Drinks'
  LIMIT 1
),
drinks_vals AS (
  SELECT *
  FROM (
    VALUES
      ('Bottle Water', 'Bottle Water', 34, 0),
      ('Coca Cola', 'Coca Cola', 42, 1),
      ('Royal', 'Royal', 42, 2),
      ('Sprite', 'Sprite', 42, 3),
      ('Ice Tea', 'Ice Tea', 48, 4),
      ('Pineapple Juice', 'Pineapple Juice', 90, 5),
      ('Bottle Coke (1.5 L Size)', 'Bottle Coke (1.5 L Size)', 142, 6),
      ('Carrot Shake', 'Carrot Shake', 165, 7)
  ) AS v(name, description, price, order_index)
),
drinks_missing AS (
  SELECT v.*
  FROM drinks_vals v
  LEFT JOIN public.menu_items m
    ON m.tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
   AND m.name = v.name
  WHERE m.id IS NULL
)
INSERT INTO public.menu_items (
  tenant_id, category_id, name, description, price,
  image_url, variations, variation_types, addons,
  is_available, is_featured, "order"
)
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  c.id,
  v.name,
  v.description,
  v.price,
  'https://via.placeholder.com/800x600?text=' ||
    replace(replace(v.name, ' ', '+'), '''', '%27'),
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  TRUE, FALSE, v.order_index
FROM drinks_cat c
CROSS JOIN drinks_missing v;

------------------------------------------------------------
-- 4) DESSERT
------------------------------------------------------------
WITH dessert_cat AS (
  SELECT id FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
    AND name = 'Dessert'
  LIMIT 1
),
dessert_vals AS (
  SELECT *
  FROM (
    VALUES
      ('Mango ice candy', 'Mango ice candy', 30, 0),
      ('Mango Graham Bar', 'Mango Graham Bar', 50, 1),
      ('Frosty Sundae Caramel', 'Frosty Sundae Caramel', 59.88, 2),
      ('Frosty Sundae Chocolate', 'Frosty Sundae Chocolate', 59.88, 3),
      ('Mais con yelo', 'Mais con yelo', 65, 4),
      ('Coke Float', 'Coke Float', 82, 5),
      ('Mango graham', 'Mango graham', 160, 6)
  ) AS v(name, description, price, order_index)
),
dessert_missing AS (
  SELECT v.*
  FROM dessert_vals v
  LEFT JOIN public.menu_items m
    ON m.tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
   AND m.name = v.name
  WHERE m.id IS NULL
)
INSERT INTO public.menu_items (
  tenant_id, category_id, name, description, price,
  image_url, variations, variation_types, addons,
  is_available, is_featured, "order"
)
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  c.id,
  v.name,
  v.description,
  v.price,
  'https://via.placeholder.com/800x600?text=' ||
    replace(replace(v.name, ' ', '+'), '''', '%27'),
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  TRUE, FALSE, v.order_index
FROM dessert_cat c
CROSS JOIN dessert_missing v;

------------------------------------------------------------
-- 5) FRUITS
------------------------------------------------------------
WITH fruits_cat AS (
  SELECT id FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
    AND name = 'Fruits'
  LIMIT 1
),
fruits_vals AS (
  SELECT *
  FROM (
    VALUES
      ('kiat kiat', 'kiat kiat', 150, 0)
  ) AS v(name, description, price, order_index)
),
fruits_missing AS (
  SELECT v.*
  FROM fruits_vals v
  LEFT JOIN public.menu_items m
    ON m.tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
   AND m.name = v.name
  WHERE m.id IS NULL
)
INSERT INTO public.menu_items (
  tenant_id, category_id, name, description, price,
  image_url, variations, variation_types, addons,
  is_available, is_featured, "order"
)
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  c.id,
  v.name,
  v.description,
  v.price,
  'https://via.placeholder.com/800x600?text=' ||
    replace(replace(v.name, ' ', '+'), '''', '%27'),
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  TRUE, FALSE, v.order_index
FROM fruits_cat c
CROSS JOIN fruits_missing v;

------------------------------------------------------------
-- 6) SULIT AND COMPLETE COMBO
------------------------------------------------------------
WITH combo_cat AS (
  SELECT id FROM public.categories
  WHERE tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
    AND name = 'Sulit and Complete Combo'
  LIMIT 1
),
combo_vals AS (
  SELECT *
  FROM (
    VALUES
      ('Spaghetti Bundle', 'Spaghetti Bundle', 1100, 0),
      ('Bihon Bundle', 'Bihon Bundle', 1100, 1)
  ) AS v(name, description, price, order_index)
),
combo_missing AS (
  SELECT v.*
  FROM combo_vals v
  LEFT JOIN public.menu_items m
    ON m.tenant_id = '0f2f24bf-d950-456e-8f86-4d2aa5087d29'
   AND m.name = v.name
  WHERE m.id IS NULL
)
INSERT INTO public.menu_items (
  tenant_id, category_id, name, description, price,
  image_url, variations, variation_types, addons,
  is_available, is_featured, "order"
)
SELECT
  '0f2f24bf-d950-456e-8f86-4d2aa5087d29',
  c.id,
  v.name,
  v.description,
  v.price,
  'https://via.placeholder.com/800x600?text=' ||
    replace(replace(v.name, ' ', '+'), '''', '%27'),
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  TRUE, FALSE, v.order_index
FROM combo_cat c
CROSS JOIN combo_missing v;

