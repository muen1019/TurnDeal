-- Existing canonical and synthetic SKU attributes already contain color.
-- Expose queryable display fields without rewriting product/price/stock or historical quotes.
CREATE VIEW product_catalog_display AS
SELECT product_id, category, brand, model, name,
       json_extract(attributes_json, '$.color') AS color,
       json_extract(attributes_json, '$.size_class') AS size_class,
       attributes_json
FROM products;
