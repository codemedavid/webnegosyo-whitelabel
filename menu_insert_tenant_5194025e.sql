-- SQL to add menu for tenant: 5194025e-c298-4087-b52a-0725d384367f
-- Generated based on user request

------------------------------------------------------------
-- 1) CATEGORIES
------------------------------------------------------------

-- Bakes
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Bakes', 'Freshly baked goods', '🍞', 0
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Bakes');

-- Pastries
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Pastries', 'Sweet pastries', '🥐', 1
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Pastries');

-- Cakes
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Cakes', 'Delicious cakes', '🎂', 2
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Cakes');

-- Breads
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Breads', 'Freshly baked breads', '🥖', 3
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Breads');

-- Bundles
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Bundles', 'Value bundles and sets', '📦', 4
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Bundles');

-- Family Trays
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Family Trays', 'Good for sharing (8-10 pax)', '🥘', 5
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Family Trays');

-- Bento Meals
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Bento Meals', 'Individual meals (Min order 15 pax)', '🍱', 6
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Bento Meals');

-- Solo Meals
INSERT INTO public.categories (tenant_id, name, description, icon, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', 'Solo Meals', 'Rice meals, pasta, and snacks for one', '🍽️', 7
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Solo Meals');


------------------------------------------------------------
-- 2) MENU ITEMS
------------------------------------------------------------

-- Helper CTEs for category IDs
WITH 
  cat_bakes AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Bakes' LIMIT 1),
  cat_pastries AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Pastries' LIMIT 1),
  cat_cakes AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Cakes' LIMIT 1),
  cat_breads AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Breads' LIMIT 1),
  cat_bundles AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Bundles' LIMIT 1),
  cat_family AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Family Trays' LIMIT 1),
  cat_bento AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Bento Meals' LIMIT 1),
  cat_solo AS (SELECT id FROM public.categories WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Solo Meals' LIMIT 1)

------------------------------------------------------------
-- INSERT BAKES
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, variation_types, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Classic Banana', 'Banana Loaf', 150.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "loaf", "name": "Loaf", "price_modifier": 0, "display_order": 1}]}]'::jsonb, 
  true, 0 FROM cat_bakes
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Double Choco', 'Banana Loaf', 200.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "loaf", "name": "Loaf", "price_modifier": 0, "display_order": 1}]}]'::jsonb, 
  true, 1 FROM cat_bakes
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Choco Walnut', 'Banana Loaf', 200.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "loaf", "name": "Loaf", "price_modifier": 0, "display_order": 1}]}]'::jsonb, 
  true, 2 FROM cat_bakes
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Coffee Walnut', 'Banana Loaf', 200.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "loaf", "name": "Loaf", "price_modifier": 0, "display_order": 1}]}]'::jsonb, 
  true, 3 FROM cat_bakes
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Cream Cheese', 'Banana Loaf', 230.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "loaf", "name": "Loaf", "price_modifier": 0, "display_order": 1}]}]'::jsonb, 
  true, 4 FROM cat_bakes
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Peanut Butter', 'Banana Loaf', 230.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "loaf", "name": "Loaf", "price_modifier": 0, "display_order": 1}]}]'::jsonb, 
  true, 5 FROM cat_bakes;

------------------------------------------------------------
-- INSERT PASTRIES
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, variation_types, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Revel Bar', 'Pastry', 120.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "big_solo", "name": "Big Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "box_12", "name": "Box of 12", "price_modifier": 230, "display_order": 1}]}]'::jsonb, 
  true, 0 FROM cat_pastries
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Walnut Brownies', 'Pastry', 120.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "big_solo", "name": "Big Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "box_12", "name": "Box of 12", "price_modifier": 230, "display_order": 1}]}]'::jsonb, 
  true, 1 FROM cat_pastries;

------------------------------------------------------------
-- INSERT CAKES
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, variation_types, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Carrot Cream Cheese', 'Cake', 150.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "round_7", "name": "Round 7\"", "price_modifier": 400, "display_order": 1}]}]'::jsonb, 
  true, 0 FROM cat_cakes
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Classic Chocolate Cake', 'Cake', 120.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "round_7", "name": "Round 7\"", "price_modifier": 380, "display_order": 1}]}]'::jsonb, 
  true, 1 FROM cat_cakes
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Blueberry Cheesecake', 'Cake', 300.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "round_7", "name": "Round 7\"", "price_modifier": 450, "display_order": 1}]}]'::jsonb, 
  true, 2 FROM cat_cakes;

------------------------------------------------------------
-- INSERT BREADS
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, variation_types, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Coffee Dream Bun', 'Bread', 60.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "box_6", "name": "Box of 6", "price_modifier": 290, "display_order": 1}]}]'::jsonb, 
  true, 0 FROM cat_breads
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Cheese Ensaymada', 'Bread', 60.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "box_6", "name": "Box of 6", "price_modifier": 290, "display_order": 1}]}]'::jsonb, 
  true, 1 FROM cat_breads
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Hamzarella Bread', 'Bread', 60.00, '', 
  '[{"id": "size", "name": "Size", "is_required": true, "display_order": 0, "options": [{"id": "solo", "name": "Solo", "price_modifier": 0, "display_order": 0, "is_default": true}, {"id": "box_6", "name": "Box of 6", "price_modifier": 290, "display_order": 1}]}]'::jsonb, 
  true, 2 FROM cat_breads;

------------------------------------------------------------
-- INSERT BUNDLES
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'All-in Bundle', 'Includes 1 Main, 1 Pasta, 1 Salad, 1 Snack, 1 Dessert Tray. FREE 1.5L Soda. Good for 8-10 pax.', 4750.00, '', true, 0 FROM cat_bundles;


------------------------------------------------------------
-- INSERT FAMILY TRAYS
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Garlic Beef & Mushroom', 'Main Dish (Family Tray). Good for 8-10 pax.', 1450.00, '', true, 0 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chinese Braised Beef', 'Main Dish (Family Tray). Good for 8-10 pax.', 1450.00, '', true, 1 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Hickory BBQ Pork Belly', 'Main Dish (Family Tray). Good for 8-10 pax.', 1350.00, '', true, 2 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chicken Ala King', 'Main Dish (Family Tray). Good for 8-10 pax.', 1350.00, '', true, 3 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Grilled Chicken Shawarma', 'Main Dish (Family Tray). Good for 8-10 pax.', 1350.00, '', true, 4 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Herbed Pepper Roast Chicken', 'Main Dish (Family Tray). Good for 8-10 pax.', 1350.00, '', true, 5 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Flavored Wings', 'Main Dish (Family Tray). Good for 8-10 pax.', 1350.00, '', true, 6 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Lemon Butter Fish Fillet', 'Main Dish (Family Tray). Good for 8-10 pax.', 1250.00, '', true, 7 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chicken Charlie', 'Pasta (Family Tray). Good for 8-10 pax.', 850.00, '', true, 8 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Bacon Carbonara', 'Pasta (Family Tray). Good for 8-10 pax.', 850.00, '', true, 9 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Classic Chicken Pesto', 'Pasta (Family Tray). Good for 8-10 pax.', 950.00, '', true, 10 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Baked Macaroni', 'Pasta (Family Tray). Good for 8-10 pax.', 950.00, '', true, 11 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Asian Garden Salad', 'Salad/Snack (Family Tray). Good for 8-10 pax.', 750.00, '', true, 12 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chicken Macaroni Salad', 'Salad/Snack (Family Tray). Good for 8-10 pax.', 850.00, '', true, 13 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Mini Clubhouse', 'Salad/Snack (Family Tray). Good for 8-10 pax.', 650.00, '', true, 14 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Special Puto Pao', 'Salad/Snack (Family Tray). Good for 8-10 pax.', 750.00, '', true, 15 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Revel Bars (Family)', 'Dessert (Family Tray). Good for 8-10 pax.', 650.00, '', true, 16 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Walnut Brownies (Family)', 'Dessert (Family Tray). Good for 8-10 pax.', 650.00, '', true, 17 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Classic Chocolate Cake (Family)', 'Dessert (Family Tray). Good for 8-10 pax.', 650.00, '', true, 18 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Carrot Cream Cheese (Family)', 'Dessert (Family Tray). Good for 8-10 pax.', 750.00, '', true, 19 FROM cat_family
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Blueberry Cheesecake (Family)', 'Dessert (Family Tray). Good for 8-10 pax.', 1250.00, '', true, 20 FROM cat_family;

-- Update specific variations for Family Trays
-- Flavored Wings (Buffalo / Soy Garlic)
UPDATE public.menu_items 
SET variation_types = '[{"id": "flavor", "name": "Flavor", "is_required": true, "display_order": 0, "options": [{"id": "buffalo", "name": "Buffalo", "price_modifier": 0, "display_order": 0}, {"id": "soy_garlic", "name": "Soy Garlic", "price_modifier": 0, "display_order": 1}]}]'::jsonb
WHERE tenant_id = '5194025e-c298-4087-b52a-0725d384367f' AND name = 'Flavored Wings' AND category_id = (SELECT id FROM cat_family);


------------------------------------------------------------
-- INSERT BENTO MEALS
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, variation_types, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Snack Bento', 'A light yet satisfying box. Min order 15 pax.', 145.00, '', 
  '[{"id": "setup", "name": "Variation", "is_required": true, "display_order": 0, "options": [{"id": "opt_a", "name": "Option A (1 Pasta + 1 Mini Clubhouse)", "price_modifier": 0, "display_order": 0}, {"id": "opt_b", "name": "Option B (1 Pasta + 1 Special Puto Pao)", "price_modifier": 0, "display_order": 1}]}]'::jsonb, 
  true, 0 FROM cat_bento
UNION ALL
-- Items with missing prices defaulted to 0.00 and disabled
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Hearty Bento', 'Balanced and filling (1 Main + 1 Side + 1 Rice). Min order 15 pax.', 0.00, '', '[]'::jsonb, false, 1 FROM cat_bento
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Feast Bento', 'Well-rounded (1 Main + 1 Side + 1 Rice + 1 Dessert). Min order 15 pax.', 0.00, '', '[]'::jsonb, false, 2 FROM cat_bento
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Grand Bento', 'Full meal (1 Main + 1 Side + 1 Pasta + 1 Rice + 1 Dessert). Min order 15 pax.', 0.00, '', '[]'::jsonb, false, 3 FROM cat_bento;

------------------------------------------------------------
-- INSERT SOLO MEALS
------------------------------------------------------------
INSERT INTO public.menu_items (tenant_id, category_id, name, description, price, image_url, variation_types, is_available, "order")
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Garlic Beef & Mushroom (Solo)', 'Rice Meal', 140.00, '', '[]'::jsonb, true, 0 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chinese Braised Beef (Solo)', 'Rice Meal', 140.00, '', '[]'::jsonb, true, 1 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Hickory BBQ Pork Belly (Solo)', 'Rice Meal', 140.00, '', '[]'::jsonb, true, 2 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chicken Ala King (Solo)', 'Rice Meal', 130.00, '', '[]'::jsonb, true, 3 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Grilled Chicken Shawarma (Solo)', 'Rice Meal', 140.00, '', '[]'::jsonb, true, 4 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Herbed Pepper Roast Chicken (Solo)', 'Rice Meal', 140.00, '', '[]'::jsonb, true, 5 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Flavored Wings (Solo)', 'Rice Meal. (Buffalo/Soy Garlic)', 130.00, '',
  '[{"id": "flavor", "name": "Flavor", "is_required": true, "display_order": 0, "options": [{"id": "buffalo", "name": "Buffalo", "price_modifier": 0, "display_order": 0}, {"id": "soy_garlic", "name": "Soy Garlic", "price_modifier": 0, "display_order": 1}]}]'::jsonb,
  true, 6 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Lemon Butter Fish Fillet (Solo)', 'Rice Meal', 120.00, '', '[]'::jsonb, true, 7 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chicken Charlie (Solo)', 'Solo Pasta', 100.00, '', '[]'::jsonb, true, 8 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Bacon Carbonara (Solo)', 'Solo Pasta', 100.00, '', '[]'::jsonb, true, 9 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Classic Chicken Pesto (Solo)', 'Solo Pasta', 120.00, '', '[]'::jsonb, true, 10 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Baked Macaroni (Solo)', 'Solo Pasta', 120.00, '', '[]'::jsonb, true, 11 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Clubhouse Sandwich', 'Solo Snack', 125.00, '', '[]'::jsonb, true, 12 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chicken Salad Sandwich', 'Solo Snack', 125.00, '', '[]'::jsonb, true, 13 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Special Puto Pao (6pcs)', 'Solo Snack', 195.00, '', '[]'::jsonb, true, 14 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Asian Garden Salad (Solo)', 'Solo Salad', 140.00, '', '[]'::jsonb, true, 15 FROM cat_solo
UNION ALL
SELECT '5194025e-c298-4087-b52a-0725d384367f', id, 'Chicken Macaroni Salad (Solo)', 'Solo Salad', 140.00, '', '[]'::jsonb, true, 16 FROM cat_solo;
