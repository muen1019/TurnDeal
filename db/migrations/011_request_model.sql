ALTER TABLE requests ADD COLUMN llm_model TEXT CHECK(llm_model IS NULL OR llm_model IN ('gpt-5.6-sol','gpt-4.1','gpt-4.1-mini'));
