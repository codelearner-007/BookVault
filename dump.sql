SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict bPme0ezwygvsacq8V1XmEX2QAmltZJVsGpOyva27rDSFJoT4hr6F9ifScCAoix0

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at", "invite_token", "referrer", "oauth_client_state_id", "linking_target_id", "email_optional") VALUES
	('13d0a4aa-0b3d-4c56-9c68-0b28c34fc623', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', 'f08a35ec-a09d-42ea-9b9f-7086012096d8', 's256', 'arDbreaekn0r6q0CRRWtXblaHJaS2_Bn2egI-D_9ZnI', 'email', '', '', '2026-04-04 20:47:56.111378+00', '2026-04-04 20:48:26.186618+00', 'email/signup', '2026-04-04 20:48:26.18657+00', NULL, NULL, NULL, NULL, false),
	('a82419b7-e4e2-4df0-b1d6-f96bf9d08af9', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'a8492897-bcf0-478a-9158-65a7079157bb', 's256', 'QEEcdfKcUBwsPHse6Wv6Jg-ebUO7eaXKIr8MBGD672A', 'email', '', '', '2026-04-04 20:52:01.270748+00', '2026-04-04 20:52:15.45721+00', 'email/signup', '2026-04-04 20:52:15.457139+00', NULL, NULL, NULL, NULL, false),
	('4a2a8de4-713c-4d18-8395-92455947777b', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', '5d7e179f-fa66-4d40-a9ed-72b79f13c8b8', 's256', 'Hr9Nb_kSXV0JvjmswGUbLmrzVfZnjBvLLauqCt-k8kk', 'recovery', '', '', '2026-04-04 21:42:57.35761+00', '2026-04-04 21:42:57.35761+00', 'recovery', NULL, NULL, NULL, NULL, NULL, false);


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', 'authenticated', 'authenticated', 'farhanahmad0819@gmail.com', '$2a$10$xwOAzHSdYH.ls4DjAhbNxOqLw81mz7sHN1SzH/pizEhWSv8rlgDBm', '2026-04-04 20:48:26.180823+00', NULL, '', '2026-04-04 20:47:56.118869+00', '', NULL, '', '', NULL, '2026-04-05 00:20:43.212974+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "ccee6395-8832-4ca8-9576-8bdd5f034b5c", "email": "farhanahmad0819@gmail.com", "full_name": "Farhan Ahmad", "email_verified": true, "phone_verified": false}', NULL, '2026-04-04 20:47:56.077691+00', '2026-04-07 21:29:16.032739+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'authenticated', 'authenticated', 'bookvault26@gmail.com', '$2a$10$c2k3ePdZArr39t128oSF0.p5Dl52QhWXwSamLUNnqbRn6OdtGI5IG', '2026-04-05 20:57:37.375346+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-04-17 16:05:27.563411+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "1a594084-34ee-4b05-9673-7a9d6316efc1", "email": "bookvault26@gmail.com", "full_name": "Book Vault", "email_verified": true, "phone_verified": false}', NULL, '2026-04-05 20:54:53.694531+00', '2026-04-18 01:14:10.410642+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'authenticated', 'authenticated', 'officialfarhan1996@gmail.com', '$2a$10$mAhi7.cCrKM.kFtFDHd1gu3SdHORhey3aOaG38cQe0R8i0ggH585S', '2026-04-04 20:52:15.451856+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-04-17 13:52:57.939257+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "174dcaf2-4429-4ac7-888b-8da6b31b8cf6", "email": "officialfarhan1996@gmail.com", "full_name": "Farhan Ahmad", "email_verified": true, "phone_verified": false}', NULL, '2026-04-04 20:52:01.228543+00', '2026-04-18 14:38:09.264685+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('ccee6395-8832-4ca8-9576-8bdd5f034b5c', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', '{"sub": "ccee6395-8832-4ca8-9576-8bdd5f034b5c", "email": "farhanahmad0819@gmail.com", "full_name": "Farhan Ahmad", "email_verified": true, "phone_verified": false}', 'email', '2026-04-04 20:47:56.108128+00', '2026-04-04 20:47:56.108187+00', '2026-04-04 20:47:56.108187+00', '7345fbb1-6def-4745-b2e5-ac1278d1c554'),
	('174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '{"sub": "174dcaf2-4429-4ac7-888b-8da6b31b8cf6", "email": "officialfarhan1996@gmail.com", "full_name": "Farhan Ahmad", "email_verified": true, "phone_verified": false}', 'email', '2026-04-04 20:52:01.266815+00', '2026-04-04 20:52:01.266865+00', '2026-04-04 20:52:01.266865+00', '5df79e5b-372d-4fe5-be37-b406399af20e'),
	('1a594084-34ee-4b05-9673-7a9d6316efc1', '1a594084-34ee-4b05-9673-7a9d6316efc1', '{"sub": "1a594084-34ee-4b05-9673-7a9d6316efc1", "email": "bookvault26@gmail.com", "full_name": "Book Vault", "email_verified": true, "phone_verified": false}', 'email', '2026-04-05 20:54:53.726766+00', '2026-04-05 20:54:53.726811+00', '2026-04-05 20:54:53.726811+00', '56fab002-522f-4d63-82f1-74d3beb73263');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('41ac51b0-d099-4228-bead-fef5df4eba5a', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', '2026-04-05 00:20:43.213072+00', '2026-04-07 21:29:17.172559+00', NULL, 'aal1', NULL, '2026-04-07 21:29:17.172468', 'Next.js Middleware', '154.208.43.242', NULL, NULL, NULL, NULL, NULL),
	('8081f67e-c637-4af2-ae57-4529aef2ffc6', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', '2026-04-04 21:33:13.309446+00', '2026-04-05 00:08:31.891474+00', NULL, 'aal1', NULL, '2026-04-05 00:08:31.891386', 'Next.js Middleware', '154.208.43.242', NULL, NULL, NULL, NULL, NULL),
	('e50a1b5a-1b9c-45c7-ba17-61be29bd18c9', '1a594084-34ee-4b05-9673-7a9d6316efc1', '2026-04-17 13:59:54.891045+00', '2026-04-17 16:02:18.838233+00', NULL, 'aal1', NULL, '2026-04-17 16:02:18.838107', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', '154.208.43.242', NULL, NULL, NULL, NULL, NULL),
	('dfc4b4e4-84e1-4100-9294-e6c7680477f0', '1a594084-34ee-4b05-9673-7a9d6316efc1', '2026-04-17 16:05:27.563524+00', '2026-04-18 01:14:10.47677+00', NULL, 'aal1', NULL, '2026-04-18 01:14:10.476659', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', '154.208.43.242', NULL, NULL, NULL, NULL, NULL),
	('3109f974-fd0a-4d0b-8456-1bbc1c342d87', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '2026-04-17 13:52:57.940416+00', '2026-04-18 14:38:09.299703+00', NULL, 'aal1', NULL, '2026-04-18 14:38:09.299592', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', '154.208.43.242', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('8081f67e-c637-4af2-ae57-4529aef2ffc6', '2026-04-04 21:33:13.31973+00', '2026-04-04 21:33:13.31973+00', 'password', 'ae1f0696-ad3b-4eb7-8367-1fa3734c81f4'),
	('41ac51b0-d099-4228-bead-fef5df4eba5a', '2026-04-05 00:20:43.226603+00', '2026-04-05 00:20:43.226603+00', 'password', 'a5cd1112-0108-4d76-9c86-63bddb87e23d'),
	('3109f974-fd0a-4d0b-8456-1bbc1c342d87', '2026-04-17 13:52:57.945004+00', '2026-04-17 13:52:57.945004+00', 'recovery', '14f106dc-0fdc-4aa4-86a6-ea0f5204b0d8'),
	('e50a1b5a-1b9c-45c7-ba17-61be29bd18c9', '2026-04-17 13:59:54.895444+00', '2026-04-17 13:59:54.895444+00', 'recovery', 'f8ce97fc-565e-4e05-bfa4-d1f49395b756'),
	('dfc4b4e4-84e1-4100-9294-e6c7680477f0', '2026-04-17 16:05:27.579478+00', '2026-04-17 16:05:27.579478+00', 'password', '1842b4d3-028a-42d8-9a49-180dfb914938');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 91, 'adof4ixangfv', '1a594084-34ee-4b05-9673-7a9d6316efc1', true, '2026-04-17 13:59:54.893185+00', '2026-04-17 15:03:57.622808+00', NULL, 'e50a1b5a-1b9c-45c7-ba17-61be29bd18c9'),
	('00000000-0000-0000-0000-000000000000', 95, '4sfd5p6rqrjz', '1a594084-34ee-4b05-9673-7a9d6316efc1', true, '2026-04-17 16:05:27.576357+00', '2026-04-18 01:14:10.372315+00', NULL, 'dfc4b4e4-84e1-4100-9294-e6c7680477f0'),
	('00000000-0000-0000-0000-000000000000', 93, 'r427vmic4tn6', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', true, '2026-04-17 15:10:08.499982+00', '2026-04-18 14:38:09.234409+00', 'dnpsq6vbmq3s', '3109f974-fd0a-4d0b-8456-1bbc1c342d87'),
	('00000000-0000-0000-0000-000000000000', 97, 'njzccryrmxbq', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', false, '2026-04-18 14:38:09.252336+00', '2026-04-18 14:38:09.252336+00', 'r427vmic4tn6', '3109f974-fd0a-4d0b-8456-1bbc1c342d87'),
	('00000000-0000-0000-0000-000000000000', 6, '6agiv3bxkq7z', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-04 21:33:13.317777+00', '2026-04-04 22:31:20.072765+00', NULL, '8081f67e-c637-4af2-ae57-4529aef2ffc6'),
	('00000000-0000-0000-0000-000000000000', 8, 'myehpmptskmr', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-04 22:31:20.078002+00', '2026-04-05 00:07:30.021783+00', '6agiv3bxkq7z', '8081f67e-c637-4af2-ae57-4529aef2ffc6'),
	('00000000-0000-0000-0000-000000000000', 10, 'fcjzccygagkj', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', false, '2026-04-05 00:07:30.041081+00', '2026-04-05 00:07:30.041081+00', 'myehpmptskmr', '8081f67e-c637-4af2-ae57-4529aef2ffc6'),
	('00000000-0000-0000-0000-000000000000', 12, 'zht4qshmyspg', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-05 00:20:43.223819+00', '2026-04-05 20:54:08.761389+00', NULL, '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 15, 'gdvj2v5ko2mt', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-05 20:54:08.778517+00', '2026-04-05 22:09:25.203336+00', 'zht4qshmyspg', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 20, 'sptd7pbx5vaq', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-05 22:09:25.21113+00', '2026-04-05 23:25:45.488171+00', 'gdvj2v5ko2mt', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 23, 'n7rmwz5aevpg', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-05 23:25:45.495708+00', '2026-04-06 00:30:04.505451+00', 'sptd7pbx5vaq', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 25, 'g427xiz2wsei', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 00:30:04.517077+00', '2026-04-06 01:30:32.688937+00', 'n7rmwz5aevpg', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 29, 'n5nxuu4rj7ua', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 01:30:32.689461+00', '2026-04-06 02:29:22.987055+00', 'g427xiz2wsei', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 32, 'akbffia7thsw', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 02:29:22.994227+00', '2026-04-06 15:42:24.440955+00', 'n5nxuu4rj7ua', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 37, '6ddcfq6l4err', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 15:42:24.441351+00', '2026-04-06 16:57:59.965496+00', 'akbffia7thsw', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 38, 'npwlk6lwujzu', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 16:57:59.97605+00', '2026-04-06 18:26:14.437695+00', '6ddcfq6l4err', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 43, 'f3yr4xpyxmny', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 18:26:14.446604+00', '2026-04-06 20:25:11.492099+00', 'npwlk6lwujzu', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 45, 'ckna7jmr7kkn', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 20:25:11.505286+00', '2026-04-06 21:34:47.659934+00', 'f3yr4xpyxmny', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 48, 'qajbgvtznvvn', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 21:34:47.674394+00', '2026-04-06 22:34:41.624569+00', 'ckna7jmr7kkn', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 52, 'h74pu3wk3kb3', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 22:34:41.63913+00', '2026-04-06 23:44:55.397939+00', 'qajbgvtznvvn', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 55, 'hcr4ipanef2v', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-06 23:44:55.39963+00', '2026-04-07 00:51:13.078549+00', 'h74pu3wk3kb3', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 66, 'ztpkiedaeytq', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-07 13:32:06.397079+00', '2026-04-07 14:51:16.80263+00', 'q7xdtc34uvz7', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 90, 'dnpsq6vbmq3s', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', true, '2026-04-17 13:52:57.942435+00', '2026-04-17 15:10:08.493461+00', NULL, '3109f974-fd0a-4d0b-8456-1bbc1c342d87'),
	('00000000-0000-0000-0000-000000000000', 92, 'omycdzshtjvw', '1a594084-34ee-4b05-9673-7a9d6316efc1', true, '2026-04-17 15:03:57.649553+00', '2026-04-17 16:02:18.760996+00', 'adof4ixangfv', 'e50a1b5a-1b9c-45c7-ba17-61be29bd18c9'),
	('00000000-0000-0000-0000-000000000000', 94, 'etqmsfjrn5et', '1a594084-34ee-4b05-9673-7a9d6316efc1', false, '2026-04-17 16:02:18.780591+00', '2026-04-17 16:02:18.780591+00', 'omycdzshtjvw', 'e50a1b5a-1b9c-45c7-ba17-61be29bd18c9'),
	('00000000-0000-0000-0000-000000000000', 58, '2rydfxoxkdds', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-07 00:51:13.086799+00', '2026-04-07 01:52:26.9182+00', 'hcr4ipanef2v', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 96, '75l4gwfvnxzf', '1a594084-34ee-4b05-9673-7a9d6316efc1', false, '2026-04-18 01:14:10.39596+00', '2026-04-18 01:14:10.39596+00', '4sfd5p6rqrjz', 'dfc4b4e4-84e1-4100-9294-e6c7680477f0'),
	('00000000-0000-0000-0000-000000000000', 61, '7sacfi6aabek', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-07 01:52:26.92909+00', '2026-04-07 02:52:04.509454+00', '2rydfxoxkdds', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 70, '2hh5sjkwldh2', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-07 14:51:16.803679+00', '2026-04-07 16:04:05.179292+00', 'ztpkiedaeytq', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 64, 'q7xdtc34uvz7', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-07 02:52:04.514948+00', '2026-04-07 13:32:06.373639+00', '7sacfi6aabek', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 73, 'wxq3vfxugv6v', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', true, '2026-04-07 16:04:05.18531+00', '2026-04-07 21:29:16.025691+00', '2hh5sjkwldh2', '41ac51b0-d099-4228-bead-fef5df4eba5a'),
	('00000000-0000-0000-0000-000000000000', 80, 'r5thahy2ei6u', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', false, '2026-04-07 21:29:16.031113+00', '2026-04-07 21:29:16.031113+00', 'wxq3vfxugv6v', '41ac51b0-d099-4228-bead-fef5df4eba5a');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: admin_tabs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."admin_tabs" ("id", "key", "label", "enabled", "order_index") VALUES
	('019d5b17-d75b-7835-b765-637bdbaa01c1', 'summary', 'Summary', true, 0),
	('019d600a-6ed3-78fd-8cfb-6bab4b4fff52', 'payments', 'Payments', true, 4),
	('019d648d-3ca2-75ba-9b64-6bc899a7eeca', 'bank-and-cash-accounts', 'Bank and Cash Accounts', true, 1),
	('019d6000-36cf-7f22-a626-f4cfbd6d9767', 'receipt', 'Receipt', true, 2),
	('019d6502-3110-7c35-a731-6d44a3ab9cbb', 'suppliers', 'Suppliers', true, 3),
	('019d6510-9a4d-7764-be49-ff3090a50ea0', 'customers', 'Customers', true, 5),
	('019d5b17-d75e-78b8-9a7a-7d150fa74084', 'reports', 'Reports', true, 7),
	('019d5b17-d75e-77ef-935b-4582f1e3ad1c', 'journal-entries', 'Journal Entries', true, 8),
	('019d5b17-d75e-78fd-b5ae-ce5ac29298ed', 'settings', 'Settings', true, 9);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."audit_logs" ("id", "created_at", "user_id", "action", "module", "resource_id", "details", "ip_address", "user_agent") VALUES
	('019d5b2f-679a-7102-ad5c-a9bab21bddfc', '2026-04-05 01:08:45.312642+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_deleted', 'businesses', '019d5b2b-20b9-7eac-aa51-477aa66cac65', '{"name": "test-2"}', NULL, NULL),
	('019d5b36-b25a-7e4d-8ea3-e966c7f9c2f8', '2026-04-05 01:16:43.742611+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_restored', 'businesses', '019d5b2b-20b9-7eac-aa51-477aa66cac65', '{"name": "test-2"}', NULL, NULL),
	('019d5b37-f58b-7618-b323-660d61dc091f', '2026-04-05 01:18:06.529345+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_deleted', 'businesses', '019d5b2b-20b9-7eac-aa51-477aa66cac65', '{"name": "test-2"}', NULL, NULL),
	('019d5f7d-2341-70b4-bbbe-133d7b24aa76', '2026-04-05 21:12:08.688501+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_created', 'businesses', '019d5f7d-2063-7e9b-a333-40719297b473', '{"name": "Test-10", "country": null, "owner_id": "1a594084-34ee-4b05-9673-7a9d6316efc1"}', NULL, NULL),
	('019d5f83-3e4b-7231-91a0-4329ac7d8c11', '2026-04-05 21:18:48.367529+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_deleted', 'businesses', '019d5b2b-20b9-7eac-aa51-477aa66cac65', '{"name": "test-2"}', NULL, NULL),
	('019d5f8a-368d-7aed-a46c-b9db0db224e4', '2026-04-05 21:26:25.282806+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_permanently_deleted', 'businesses', '019d5b2b-20b9-7eac-aa51-477aa66cac65', '{"name": "test-2"}', NULL, NULL),
	('019d5f8b-5af9-75fb-898a-f0c6509f0cac', '2026-04-05 21:27:40.835693+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_deleted', 'businesses', '019d5b2b-02d7-7687-81a6-8aac5982fddf', '{"name": "test -1"}', NULL, NULL),
	('019d5fbc-7a4e-7800-99b6-84c0930602c8', '2026-04-05 22:21:19.775175+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_deleted', 'businesses', '019d5f7d-2063-7e9b-a333-40719297b473', '{"name": "Test-10"}', NULL, NULL),
	('019d5fbc-ac41-79a1-b966-d148032f3f6c', '2026-04-05 22:21:32.959288+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_restored', 'businesses', '019d5f7d-2063-7e9b-a333-40719297b473', '{"name": "Test-10"}', NULL, NULL),
	('019d5fbd-0503-7e93-9245-d98fcce1de5c', '2026-04-05 22:21:55.668834+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_created', 'businesses', '019d5fbd-03a9-7497-bf54-b170f0221b6c', '{"name": "test1", "country": null, "owner_id": "1a594084-34ee-4b05-9673-7a9d6316efc1"}', NULL, NULL),
	('019d5fbd-369e-7926-a40f-14fd8b1867d7', '2026-04-05 22:22:07.957065+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_deleted', 'businesses', '019d5fbd-03a9-7497-bf54-b170f0221b6c', '{"name": "test1"}', NULL, NULL),
	('019d5fbe-a826-7f3b-a045-354bb89d2a80', '2026-04-05 22:23:42.964497+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_restored', 'businesses', '019d5fbd-03a9-7497-bf54-b170f0221b6c', '{"name": "test1"}', NULL, NULL),
	('019d5fbe-dc87-731e-8a7f-9f69bfaa7b73', '2026-04-05 22:23:56.55168+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_deleted', 'businesses', '019d5fbd-03a9-7497-bf54-b170f0221b6c', '{"name": "test1"}', NULL, NULL),
	('019d5fbf-0e0e-749b-9082-e4166eb559ff', '2026-04-05 22:24:08.868276+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_permanently_deleted', 'businesses', '019d5fbd-03a9-7497-bf54-b170f0221b6c', '{"name": "test1"}', NULL, NULL),
	('019d605c-8eaf-79a5-b963-fcaf59f52b29', '2026-04-06 01:16:10.732946+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_created', 'businesses', '019d605c-8bd4-7add-a309-ab4ffa55bfd5', '{"name": "test-2", "country": null, "owner_id": "1a594084-34ee-4b05-9673-7a9d6316efc1"}', NULL, NULL),
	('019d605f-cb5c-71d2-a813-4d9690042ccc', '2026-04-06 01:19:42.619795+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_created', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "test", "country": null, "owner_id": "1a594084-34ee-4b05-9673-7a9d6316efc1"}', NULL, NULL),
	('019d60a2-05c4-7122-9b8c-a1d358879ae3', '2026-04-06 02:32:02.768566+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_updated', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100", "address": "123 ABC Lahore", "country": "Pakistan"}', NULL, NULL),
	('019d60a3-7e41-7ec0-84a6-f49749c944a3', '2026-04-06 02:33:38.968114+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_updated', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100", "address": null, "country": "Pakistan"}', NULL, NULL),
	('019d60a3-a2c9-731e-a331-a3759638990d', '2026-04-06 02:33:48.693437+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_updated', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100", "address": null, "country": "Pakistan"}', NULL, NULL),
	('019d60a4-9651-7b95-8c09-ec4c6ca4fbd5', '2026-04-06 02:34:51.239296+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_updated', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100", "address": null, "country": "Pakistan"}', NULL, NULL),
	('019d60a5-540b-7f53-b6cb-40a3baed9e94', '2026-04-06 02:35:39.636584+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_reset', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100"}', NULL, NULL),
	('019d60a5-840d-747a-bac6-14e6262dfe66', '2026-04-06 02:35:51.405368+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_updated', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100", "address": null, "country": null}', NULL, NULL),
	('019d60a5-cfa2-7641-b564-a8c5222de220', '2026-04-06 02:36:11.6806+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_updated', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100", "address": null, "country": null}', NULL, NULL),
	('019d60a6-ae12-7614-a017-29d63292739d', '2026-04-06 02:37:07.791624+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_updated', 'businesses', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '{"name": "Test-100", "address": null, "country": null}', NULL, NULL),
	('019d6536-0c29-794b-86fc-08a41d0c5e90', '2026-04-06 23:52:12.547088+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Customer', '019d6536-0903-7849-8f25-cb89e31a1205', '{"name": "kkdsaf", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d655c-4560-712b-b2a8-04e926f0a49a', '2026-04-07 00:33:57.644122+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Delete', 'Customer', '019d6536-0903-7849-8f25-cb89e31a1205', '{"name": "kkdsaf", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d655e-143d-748b-b043-4c69940ef563', '2026-04-07 00:35:56.366606+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Supplier', '019d655e-118b-72dd-8968-f4f3e7ba0d5e', '{"name": "Arham", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6580-1d1b-79e3-8531-76d7494c033c', '2026-04-07 01:13:06.77073+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Customer', '019d6580-1a16-7672-befc-b06c8e4f3b0c', '{"name": "farhan", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65ba-f6ea-77fb-8641-da0c2b21f607', '2026-04-07 02:17:23.169471+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d65ba-f215-7c51-96a5-f1b5b500f759', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65bb-4298-702d-a75d-29f917211fd1', '2026-04-07 02:17:42.186081+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65ba-f215-7c51-96a5-f1b5b500f759', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65bb-b4ad-7b89-9dc4-24144c80e9bf', '2026-04-07 02:18:11.656848+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65ba-f215-7c51-96a5-f1b5b500f759', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65bc-33b5-7b6c-bf76-3f5acb56e83f', '2026-04-07 02:18:44.832731+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d65bc-3147-7db6-a05b-e46e89492cff', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65bc-5670-7f2b-9b91-cf13f7d45c1a', '2026-04-07 02:18:52.884745+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Delete', 'Receipt', '019d65ba-f215-7c51-96a5-f1b5b500f759', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65bd-46fe-7f47-8a9b-ab85d95efe3b', '2026-04-07 02:19:55.007956+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d65bd-42ff-70ed-91f1-cfb14f28d790', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65c2-1268-7cfd-b0c0-aa6810d3cb5b', '2026-04-07 02:25:07.692997+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Delete', 'Receipt', '019d65bc-3147-7db6-a05b-e46e89492cff', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65d3-13b1-77a9-a96d-3f98d3b316e6', '2026-04-07 02:43:43.109433+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Customer', '019d651f-452a-79a5-96b3-b1c846bec006', '{"name": "farhan", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65d3-58eb-7c72-8853-0c420dc96600', '2026-04-07 02:44:00.688056+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Customer', '019d651f-452a-79a5-96b3-b1c846bec006', '{"name": "Farhan Ahmad", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65d5-b29c-71b2-942b-e59901505533', '2026-04-07 02:46:35.030073+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Delete', 'Receipt', '019d65bd-42ff-70ed-91f1-cfb14f28d790', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65d9-7846-72f9-996f-8417b718621d', '2026-04-07 02:50:41.266071+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65e3-14a9-7160-811b-3bf30a5802bb', '2026-04-07 03:01:11.335471+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65ea-5458-7712-a544-f6245e491044', '2026-04-07 03:09:08.208719+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d65fa-5b4a-7758-a0a8-9a14e1c7bca1', '2026-04-07 03:26:37.736308+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d683d-8372-7706-be36-a0b5afc03f63', '2026-04-07 13:59:13.44485+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d683e-7fe5-7795-a51a-1d6e0f8aaf0e', '2026-04-07 14:00:18.00986+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6850-15a1-768f-8772-5e6c5fbd6e07', '2026-04-07 14:19:30.047872+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d685e-6e5f-702d-9b77-fdfdfcfa3eab', '2026-04-07 14:35:09.834514+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6866-796f-7a08-b713-ed8353309819', '2026-04-07 14:43:57.039851+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6868-860b-7820-a9a9-9cff14884295', '2026-04-07 14:46:12.627067+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'BalanceSheetCashAtBankAccount', '019d6868-83d9-7a1c-a416-2d1aa72f4408', '{"name": "test", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6868-ca09-7f91-9c91-f90be92a1636', '2026-04-07 14:46:29.932788+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'BalanceSheetCashAtBankAccount', '019d6868-c73c-7256-b9c9-fb785f4b6008', '{"name": "sd", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6868-eb42-7662-8ce4-42ff6fca0c87', '2026-04-07 14:46:38.299743+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'BalanceSheetCashAtBankAccount', '019d6868-c73c-7256-b9c9-fb785f4b6008', '{"name": "sd", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6869-0c2a-74dd-8980-12f56d86ea18', '2026-04-07 14:46:46.299894+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Delete', 'BalanceSheetCashAtBankAccount', '019d6868-c73c-7256-b9c9-fb785f4b6008', '{"name": "sd", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6869-3277-7872-bb9a-f3de9b7a857f', '2026-04-07 14:46:56.195252+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Delete', 'BalanceSheetCashAtBankAccount', '019d6868-83d9-7a1c-a416-2d1aa72f4408', '{"name": "test", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d687c-2678-75eb-8958-8d87dc603161', '2026-04-07 15:07:37.087195+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d687c-729a-7560-9996-8429c57704d3', '2026-04-07 15:07:56.530176+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68c8-4937-766a-848b-677ccadbc732', '2026-04-07 16:30:47.05514+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d68c8-423e-7160-aa4c-0d788cd6221c', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68cd-a0d0-7451-8908-3cae83669078', '2026-04-07 16:36:36.958204+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68d8-c7ee-7fa9-b5a6-5f67db19bdf7', '2026-04-07 16:48:47.126596+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68c8-423e-7160-aa4c-0d788cd6221c', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68ec-86d3-78cc-89b9-5f0c3049e312', '2026-04-07 17:10:22.223599+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d68ec-7f7f-733b-8ca8-6638be27c03c', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68ed-c182-795c-9056-69e1fc0fae51', '2026-04-07 17:11:42.128131+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68ec-7f7f-733b-8ca8-6638be27c03c', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68ee-7ef3-7d95-bf7a-ffab144400b8', '2026-04-07 17:12:28.611088+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68ee-ef38-7bbe-ab1d-b95592095193', '2026-04-07 17:12:56.242988+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68ec-7f7f-733b-8ca8-6638be27c03c', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68ef-3c3c-75a9-a3c4-089ef0559df0', '2026-04-07 17:13:15.31998+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68f2-8ee8-74d0-95f9-b2cd12cc23e7', '2026-04-07 17:16:54.887195+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Delete', 'Receipt', '019d68ec-7f7f-733b-8ca8-6638be27c03c', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68fc-cf34-79eb-81a9-10c68f411004', '2026-04-07 17:28:09.829218+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'BalanceSheetCashAtBankAccount', '019d68fc-cb54-7964-b77d-707e7056c0c6', '{"name": "Cash", "business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d68fd-4ea8-7824-b74f-a7f4652e12f5', '2026-04-07 17:28:40.690816+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6903-a29f-768b-9b80-a6b2359d62e5', '2026-04-07 17:35:28.589871+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6908-db33-7b6c-9672-36bb2a564439', '2026-04-07 17:41:18.058286+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d6909-9436-77d7-a70a-ce1a767372c6', '2026-04-07 17:42:06.714913+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d690c-f2bb-7968-a5fb-500cc575a137', '2026-04-07 17:45:45.833017+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Update', 'Receipt', '019d68cd-99c7-7522-b1c4-c15a0bd85d99', '{"business_id": "019d605f-c771-7bf3-bd5b-2962586ec2bd"}', NULL, NULL),
	('019d9b9e-465b-72b8-bf04-becf2d54c3ac', '2026-04-17 13:25:27.976689+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_created', 'businesses', '019d9b9e-2f9b-7368-a385-682817f94e1d', '{"name": "test", "country": null, "owner_id": "174dcaf2-4429-4ac7-888b-8da6b31b8cf6"}', NULL, NULL),
	('019d9b9f-b78f-7791-9943-d13b34def347', '2026-04-17 13:27:07.207327+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Create', 'BalanceSheetCashAtBankAccount', '019d9b9f-b428-7bf3-8cf5-909610313742', '{"name": "test-1", "business_id": "019d9b9e-2f9b-7368-a385-682817f94e1d"}', NULL, NULL),
	('019d9ba0-64af-7ed4-ae94-141b75824d49', '2026-04-17 13:27:48.793167+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Create', 'Receipt', '019d9ba0-58da-7916-bf94-17ec5c2581b3', '{"business_id": "019d9b9e-2f9b-7368-a385-682817f94e1d"}', NULL, NULL),
	('019d9bac-1b37-7dfb-95c2-7fca38042212', '2026-04-17 13:40:29.458692+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Create', 'BalanceSheetCashAtBankAccount', '019d9bac-0244-767a-9e0a-315abc679f40', '{"name": "Main Bank", "business_id": "019d5b2a-a710-7b68-baec-697183498367"}', NULL, NULL),
	('019d9bac-9b79-7ec0-9fa9-3e0417770769', '2026-04-17 13:41:12.068683+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Create', 'BalanceSheetCashAtBankAccount', '019d9bac-989a-7c24-bf99-824273033422', '{"name": "Savings Account", "business_id": "019d5b2a-a710-7b68-baec-697183498367"}', NULL, NULL),
	('019d9bad-de2e-7799-b993-f4173d218f7d', '2026-04-17 13:42:32.965575+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Create', 'BalanceSheetCashAtBankAccount', '019d9bad-d33e-711e-9636-ca0644d8bf29', '{"name": "Main Bank", "business_id": "019d5b2b-02d7-7687-81a6-8aac5982fddf"}', NULL, NULL),
	('019d9bb2-aa50-7814-83c8-3bcf6519f624', '2026-04-17 13:47:44.452638+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'BalanceSheetCashAtBankAccount', '019d9bb2-9572-7fa9-966d-a124763b20c0', '{"name": "Main Bank", "business_id": "019d605c-8bd4-7add-a309-ab4ffa55bfd5"}', NULL, NULL),
	('019d9bb3-a256-77a5-905f-a9908e7302dc', '2026-04-17 13:48:51.717939+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'BalanceSheetCashAtBankAccount', '019d9bb3-9aa6-72e9-a8b9-e6d1568321f3', '{"name": "Test Bank", "business_id": "019d5f7d-2063-7e9b-a333-40719297b473"}', NULL, NULL),
	('019d9bb7-d783-7f3b-bbb0-9e5e525a4791', '2026-04-17 13:53:26.096072+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'business_created', 'businesses', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', '{"name": "test-2", "country": null, "owner_id": "174dcaf2-4429-4ac7-888b-8da6b31b8cf6"}', NULL, NULL),
	('019d9bb8-9ba6-7c5a-b063-0e516c611180', '2026-04-17 13:54:16.586016+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Create', 'BalanceSheetCashAtBankAccount', '019d9bb8-9168-76cc-bc1a-3e8fe9a9f05d', '{"name": "test-1", "business_id": "019d9bb7-ca18-7ec8-bc3c-418d0e553ae0"}', NULL, NULL),
	('019d9bb9-0151-7f26-8e82-1bb6d5000d96', '2026-04-17 13:54:43.671941+00', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Create', 'Receipt', '019d9bb8-f977-7c2d-8bd9-d8712c73c73a', '{"business_id": "019d9bb7-ca18-7ec8-bc3c-418d0e553ae0"}', NULL, NULL),
	('019d9bc4-cde3-7381-b250-ef1c12ac303a', '2026-04-17 14:07:38.458937+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_deleted', 'businesses', '019d605c-8bd4-7add-a309-ab4ffa55bfd5', '{"name": "test-2"}', NULL, NULL),
	('019d9bc4-ef9a-7106-aed7-6c0346ba6484', '2026-04-17 14:07:47.072044+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_deleted', 'businesses', '019d5f7d-2063-7e9b-a333-40719297b473', '{"name": "Test-10"}', NULL, NULL),
	('019d9bc5-08a1-7a62-8769-b29c3da31d98', '2026-04-17 14:07:53.33388+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_permanently_deleted', 'businesses', '019d5f7d-2063-7e9b-a333-40719297b473', '{"name": "Test-10"}', NULL, NULL),
	('019d9bc5-1ee8-7391-bbe5-a05b2fa5631e', '2026-04-17 14:07:58.628754+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_permanently_deleted', 'businesses', '019d605c-8bd4-7add-a309-ab4ffa55bfd5', '{"name": "test-2"}', NULL, NULL),
	('019d9bc5-8999-722d-a6a0-4864b2680251', '2026-04-17 14:08:22.984992+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'business_created', 'businesses', '019d9bc5-7932-7178-996d-77cac88e22b1', '{"name": "test-4", "country": null, "owner_id": "1a594084-34ee-4b05-9673-7a9d6316efc1"}', NULL, NULL),
	('019d9bc6-5230-7943-abb4-0840c27be2db', '2026-04-17 14:09:13.426029+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'BalanceSheetCashAtBankAccount', '019d9bc6-413c-718d-9227-acc0509aff3a', '{"name": "test-1", "business_id": "019d9bc5-7932-7178-996d-77cac88e22b1"}', NULL, NULL),
	('019d9bc6-b5df-74cc-a981-3001bcd0177e', '2026-04-17 14:09:41.858645+00', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Create', 'Receipt', '019d9bc6-ae6e-7651-ac13-192ff23a2f48', '{"business_id": "019d9bc5-7932-7178-996d-77cac88e22b1"}', NULL, NULL);


--
-- Data for Name: businesses; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."businesses" ("id", "name", "country", "owner_id", "created_at", "updated_at", "deleted_at") VALUES
	('019d5b2a-a710-7b68-baec-697183498367', 'promo', NULL, '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '2026-04-05 01:03:34.819073+00', '2026-04-05 01:03:34.819073+00', NULL),
	('019d5b2b-02d7-7687-81a6-8aac5982fddf', 'test -1', NULL, '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '2026-04-05 01:03:58.497372+00', '2026-04-05 21:27:40.835693+00', '2026-04-05 21:27:40.42518+00'),
	('019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Test-100', NULL, '1a594084-34ee-4b05-9673-7a9d6316efc1', '2026-04-06 01:19:42.619795+00', '2026-04-06 02:37:07.791624+00', NULL),
	('019d9b9e-2f9b-7368-a385-682817f94e1d', 'test', NULL, '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '2026-04-17 13:25:27.976689+00', '2026-04-17 13:25:27.976689+00', NULL),
	('019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'test-2', NULL, '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '2026-04-17 13:53:26.096072+00', '2026-04-17 13:53:26.096072+00', NULL),
	('019d9bc5-7932-7178-996d-77cac88e22b1', 'test-4', NULL, '1a594084-34ee-4b05-9673-7a9d6316efc1', '2026-04-17 14:08:22.984992+00', '2026-04-17 14:08:22.984992+00', NULL);


--
-- Data for Name: bank_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."bank_accounts" ("id", "business_id", "name", "opening_balance", "current_balance", "description", "created_at", "updated_at") VALUES
	('019d64dd-a4fe-700c-9aaa-a9b2b928a472', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'promo', 0.00, 2950.00, NULL, '2026-04-06 22:15:39.803807+00', '2026-04-07 17:35:28.589871+00'),
	('019d68fc-cb54-7964-b77d-707e7056c0c6', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Cash', 0.00, 450.00, NULL, '2026-04-07 17:28:09.829218+00', '2026-04-07 17:45:45.833017+00'),
	('019d9b9f-b428-7bf3-8cf5-909610313742', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'test-1', 0.00, 100.00, NULL, '2026-04-17 13:27:07.207327+00', '2026-04-17 13:27:48.793167+00'),
	('019d9bac-0244-767a-9e0a-315abc679f40', '019d5b2a-a710-7b68-baec-697183498367', 'Main Bank', 0.00, 0.00, 'Test bank account', '2026-04-17 13:40:29.458692+00', '2026-04-17 13:40:29.458692+00'),
	('019d9bac-989a-7c24-bf99-824273033422', '019d5b2a-a710-7b68-baec-697183498367', 'Savings Account', 500.00, 500.00, 'Second bank account', '2026-04-17 13:41:12.068683+00', '2026-04-17 13:41:12.068683+00'),
	('019d9bad-d33e-711e-9636-ca0644d8bf29', '019d5b2b-02d7-7687-81a6-8aac5982fddf', 'Main Bank', 0.00, 0.00, NULL, '2026-04-17 13:42:32.965575+00', '2026-04-17 13:42:32.965575+00'),
	('019d9bb8-9168-76cc-bc1a-3e8fe9a9f05d', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'test-1', 0.00, 100.00, NULL, '2026-04-17 13:54:16.586016+00', '2026-04-17 13:54:43.671941+00'),
	('019d9bc6-413c-718d-9227-acc0509aff3a', '019d9bc5-7932-7178-996d-77cac88e22b1', 'test-1', 0.00, 100.00, NULL, '2026-04-17 14:09:13.426029+00', '2026-04-17 14:09:41.858645+00');


--
-- Data for Name: business_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."business_details" ("id", "business_id", "address", "image_url", "updated_at") VALUES
	('019d60a2-046a-7e9f-a07d-e3e0ff879b92', '019d605f-c771-7bf3-bd5b-2962586ec2bd', NULL, NULL, '2026-04-06 02:37:07.791624+00');


--
-- Data for Name: business_format; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: business_tab_columns; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."business_tab_columns" ("id", "business_id", "tab_key", "col_key", "visible", "order_index") VALUES
	('019d68d5-8375-7fe7-98c9-c7cd7e92bc09', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'date', true, 0),
	('019d68d5-8442-7d33-b8c9-835ad5ec52c3', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'reference', true, 1),
	('019d68d5-853e-773f-bb6f-b106c40162ce', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'paid_by', true, 2),
	('019d68d5-8673-7789-b8bd-0231217edd30', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'received_in', true, 3),
	('019d68d5-8729-7a4d-af8b-5ffe5c59f77b', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'description', true, 4),
	('019d68d5-87f2-7b43-8ed9-5721f9fea03d', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'attachment', false, 5),
	('019d68d5-88c4-7466-9b32-10c9bc0ad9f4', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'qty', true, 6),
	('019d68d5-89fb-7e87-8378-2f725ae82390', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'discount', false, 7),
	('019d68d5-8aca-7676-88a0-fb2d221126be', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'amount', true, 8),
	('019d68d6-9ed4-7391-83ff-96fbbe8ea815', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'customers', 'code', true, 0),
	('019d68d6-9f93-7883-b23b-15ae506f18e3', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'customers', 'name', true, 1),
	('019d68d6-a053-7cc8-a4b3-115a7f050a99', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'customers', 'email', true, 2);


--
-- Data for Name: business_tabs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."business_tabs" ("id", "business_id", "key", "label", "enabled", "order_index") VALUES
	('019d648d-d271-7c31-8f11-d29ab63d99da', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'bank-and-cash-accounts', 'Bank and Cash Accounts', true, 1),
	('019d9b9f-0d3f-72cc-9076-f2b7a1101f3f', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'summary', 'Summary', true, 0),
	('019d9b9f-1068-70dd-b4e7-89b5df53d35f', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'bank-and-cash-accounts', 'Bank and Cash Accounts', true, 1),
	('019d9b9f-1221-7f95-a0f5-0b53ce1d60c7', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'receipt', 'Receipt', true, 2),
	('019d9b9f-15ea-7f0a-8ee0-d63712cf5e14', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'suppliers', 'Suppliers', false, 3),
	('019d9b9f-176d-7d0e-8370-80ad8dbb8fcd', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'payments', 'Payments', false, 4),
	('019d9b9f-1908-718d-8a9f-9a00914e93e9', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'customers', 'Customers', false, 5),
	('019d9b9f-1a69-7dd7-837b-d8d9f61d5a86', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'reports', 'Reports', false, 6),
	('019d9b9f-1bca-79ce-a369-f0540660a57c', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'journal-entries', 'Journal Entries', false, 7),
	('019d9b9f-1d65-7d0e-8afa-20871f7d4430', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'settings', 'Settings', true, 8),
	('019d9bb8-339f-73c6-a885-bc2e172ca4b9', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'summary', 'Summary', true, 0),
	('019d9bb8-3507-78bc-8f05-1951fddad309', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'bank-and-cash-accounts', 'Bank and Cash Accounts', true, 1),
	('019d9bb8-3695-7716-af6a-4419c29bd094', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'receipt', 'Receipt', true, 2),
	('019d9bb8-3838-7b89-b82d-17b6f9ef26a7', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'suppliers', 'Suppliers', false, 3),
	('019d6015-564e-7d1a-b592-182cc25460ec', '019d5b2a-a710-7b68-baec-697183498367', 'summary', 'Summary', true, 0),
	('019d6015-61f2-7c66-b73c-25908e094523', '019d5b2a-a710-7b68-baec-697183498367', 'settings', 'Settings', true, 5),
	('019d6015-5fec-7076-915f-61ccd801f4f3', '019d5b2a-a710-7b68-baec-697183498367', 'payments', 'Payments', true, 1),
	('019d6015-5df3-7b78-89de-0fef6982f3e6', '019d5b2a-a710-7b68-baec-697183498367', 'receipt', 'Receipt', true, 2),
	('019d6015-591f-7e56-8237-86db5591a2df', '019d5b2a-a710-7b68-baec-697183498367', 'journal-entries', 'Journal Entries', true, 3),
	('019d6015-5b6c-7fb2-98e3-81744c028039', '019d5b2a-a710-7b68-baec-697183498367', 'reports', 'Reports', false, 4),
	('019d648d-d0f5-7758-89c6-82d7e9420bbf', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'summary', 'Summary', true, 0),
	('019d9bb8-3bb6-7785-b6c2-41d30c460891', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'payments', 'Payments', false, 4),
	('019d9bb8-3d3f-7799-b579-7a6dd32b8017', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'customers', 'Customers', false, 5),
	('019d9bb8-3ed4-7e87-ba67-b7df1071ba80', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'reports', 'Reports', false, 6),
	('019d9bb8-404a-73b6-8b13-1ee9359d8098', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'journal-entries', 'Journal Entries', false, 7),
	('019d648d-da09-7656-a3f2-53918f7f79cb', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'chart-of-accounts', 'Chart of Accounts', false, 6),
	('019d9bb8-4206-772f-bdc5-c6e362fec8af', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'settings', 'Settings', true, 8),
	('019d6504-5c7a-7cf5-91f2-b94628728441', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'customer', 'Customers', true, 8),
	('019d648d-db9c-731a-a395-ff6ee0c206e4', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'settings', 'Settings', true, 8),
	('019d9bc5-f337-7d7c-9de3-6bc7f030bc1d', '019d9bc5-7932-7178-996d-77cac88e22b1', 'summary', 'Summary', true, 0),
	('019d9bc5-f646-7c3d-8b74-3e1c3e496a09', '019d9bc5-7932-7178-996d-77cac88e22b1', 'bank-and-cash-accounts', 'Bank and Cash Accounts', true, 1),
	('019d648d-d407-7ab0-8015-3845666526c6', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'journal-entries', 'Journal Entries', false, 7),
	('019d9bc5-f7e1-70b4-9c8d-45655de87cf9', '019d9bc5-7932-7178-996d-77cac88e22b1', 'receipt', 'Receipt', true, 2),
	('019d648d-d6f1-7056-afda-83e5600800e5', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'receipt', 'Receipt', true, 2),
	('019d6513-c995-7428-8fd1-35cf98192e98', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'customers', 'Customers', true, 3),
	('019d6504-55fe-71e7-90b3-659748aa7d4e', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'suppliers', 'Suppliers', true, 4),
	('019d648d-d869-7251-bab8-25ccb662a564', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'payments', 'Payments', false, 5),
	('019d648d-d578-7edd-8f26-e3ed71936abc', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'reports', 'Reports', false, 6),
	('019d9bc5-f999-7dae-a297-91ecbd522048', '019d9bc5-7932-7178-996d-77cac88e22b1', 'suppliers', 'Suppliers', false, 3),
	('019d9bc5-fb4c-71db-bc88-844649e8c17a', '019d9bc5-7932-7178-996d-77cac88e22b1', 'payments', 'Payments', false, 4),
	('019d9bc5-fd4e-7ab0-8996-46820805542f', '019d9bc5-7932-7178-996d-77cac88e22b1', 'customers', 'Customers', false, 5),
	('019d9bc5-ff57-79e3-8d4f-d1595b9c0f89', '019d9bc5-7932-7178-996d-77cac88e22b1', 'reports', 'Reports', false, 6),
	('019d9bc6-013f-756c-882b-834f828763e8', '019d9bc5-7932-7178-996d-77cac88e22b1', 'journal-entries', 'Journal Entries', false, 7),
	('019d9bc6-039e-7b0a-898b-96c531e9de0a', '019d9bc5-7932-7178-996d-77cac88e22b1', 'settings', 'Settings', true, 8);


--
-- Data for Name: coa_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."coa_groups" ("id", "business_id", "name", "type", "parent_group_id", "is_system", "is_orphaned", "sort_order", "created_at", "updated_at") VALUES
	('019d6407-4b1d-7200-a92f-723518ef4f2a', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Assets', 'balance_sheet', NULL, true, false, 0, '2026-04-06 18:21:32.827304+00', '2026-04-06 18:52:50.950197+00'),
	('019d63cd-091b-7c7a-99ed-c6f033728274', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Liabilities', 'balance_sheet', NULL, true, false, 1, '2026-04-06 17:17:53.926663+00', '2026-04-06 18:52:50.950197+00'),
	('019d6407-745b-77db-8147-ad01313a6330', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Equity', 'balance_sheet', NULL, true, false, 2, '2026-04-06 18:21:43.386492+00', '2026-04-06 18:52:50.950197+00'),
	('019d6485-94cd-7e93-95ad-26f487a75913', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Income', 'pl', NULL, false, false, 0, '2026-04-06 20:39:28.715674+00', '2026-04-06 20:39:28.715674+00'),
	('019d6486-81d1-74dd-8e5c-76803be3d95a', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Expenses', 'pl', NULL, false, false, 0, '2026-04-06 20:40:29.56209+00', '2026-04-06 20:40:29.56209+00'),
	('019d9b9e-36b4-7981-884a-0a4dd4ff3963', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'Assets', 'balance_sheet', NULL, true, false, 0, '2026-04-17 13:25:27.976689+00', '2026-04-17 13:25:27.976689+00'),
	('019d9b9e-3974-76e1-8525-da720f087177', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'Liabilities', 'balance_sheet', NULL, true, false, 1, '2026-04-17 13:25:27.976689+00', '2026-04-17 13:25:27.976689+00'),
	('019d9b9e-3cb8-70e9-823f-f89f1382dbbe', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'Equity', 'balance_sheet', NULL, true, false, 2, '2026-04-17 13:25:27.976689+00', '2026-04-17 13:25:27.976689+00'),
	('019d9bb7-cd15-77eb-801d-097657dd4c62', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'Assets', 'balance_sheet', NULL, true, false, 0, '2026-04-17 13:53:26.096072+00', '2026-04-17 13:53:26.096072+00'),
	('019d9bb7-cf4b-7a7e-b071-10720e5f2682', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'Liabilities', 'balance_sheet', NULL, true, false, 1, '2026-04-17 13:53:26.096072+00', '2026-04-17 13:53:26.096072+00'),
	('019d9bb7-d0a9-79a9-9522-41d88fdbf91f', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'Equity', 'balance_sheet', NULL, true, false, 2, '2026-04-17 13:53:26.096072+00', '2026-04-17 13:53:26.096072+00'),
	('019d9bc5-7bb7-7ae1-a146-f18086c16274', '019d9bc5-7932-7178-996d-77cac88e22b1', 'Assets', 'balance_sheet', NULL, true, false, 0, '2026-04-17 14:08:22.984992+00', '2026-04-17 14:08:22.984992+00'),
	('019d9bc5-7e28-7efd-ac79-5606f0aa7b45', '019d9bc5-7932-7178-996d-77cac88e22b1', 'Liabilities', 'balance_sheet', NULL, true, false, 1, '2026-04-17 14:08:22.984992+00', '2026-04-17 14:08:22.984992+00'),
	('019d9bc5-80c6-71ce-9349-012f36a71956', '019d9bc5-7932-7178-996d-77cac88e22b1', 'Equity', 'balance_sheet', NULL, true, false, 2, '2026-04-17 14:08:22.984992+00', '2026-04-17 14:08:22.984992+00');


--
-- Data for Name: coa_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."coa_accounts" ("id", "business_id", "name", "code", "group_id", "cash_flow_category", "sort_order", "created_at", "updated_at", "is_system", "type", "description", "is_active", "parent_id") VALUES
	('019d6407-f913-7fae-8bda-b483d1ff8506', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Retained Earnings', NULL, '019d6407-745b-77db-8147-ad01313a6330', NULL, 0, '2026-04-06 18:22:17.362963+00', '2026-04-16 21:21:39.809352+00', true, 'equity', NULL, true, NULL),
	('019d640a-0c1a-70c4-9d4d-b15fee4ea812', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Cash and Cash Equilent', NULL, '019d6407-4b1d-7200-a92f-723518ef4f2a', NULL, 0, '2026-04-06 18:24:32.757861+00', '2026-04-16 21:21:39.809352+00', false, 'asset', NULL, true, NULL),
	('019d6408-2758-731a-a4d9-fa0a48f08215', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Net Profit (Loss)', NULL, NULL, NULL, 0, '2026-04-06 18:22:29.207228+00', '2026-04-16 21:21:39.809352+00', true, 'total', NULL, true, NULL),
	('019d6485-ec68-7c10-9f61-c62008f9f884', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Sales', NULL, '019d6485-94cd-7e93-95ad-26f487a75913', NULL, 0, '2026-04-06 20:39:51.103478+00', '2026-04-16 21:21:39.809352+00', false, 'income', NULL, true, NULL),
	('019d6486-c7ff-73ba-9f85-f6e4e2d32855', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Salaries', NULL, '019d6486-81d1-74dd-8e5c-76803be3d95a', 'operating', 0, '2026-04-06 20:40:47.332729+00', '2026-04-16 21:36:37.842598+00', false, 'expense', NULL, true, NULL),
	('019d9b9e-4033-7b6c-a55a-b52c66b22fdb', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'Retained Earnings', NULL, '019d9b9e-3cb8-70e9-823f-f89f1382dbbe', NULL, 0, '2026-04-17 13:25:27.976689+00', '2026-04-17 13:25:27.976689+00', true, 'equity', NULL, true, NULL),
	('019d9b9e-4376-7764-b06b-4736fe524a9d', '019d9b9e-2f9b-7368-a385-682817f94e1d', 'Net Profit (Loss)', NULL, NULL, NULL, 0, '2026-04-17 13:25:27.976689+00', '2026-04-17 13:25:27.976689+00', true, 'total', NULL, true, NULL),
	('019d9bac-0afa-7f1a-8232-3b2fdeb1d4bc', '019d5b2a-a710-7b68-baec-697183498367', 'Cash and Cash Equivalents', NULL, NULL, NULL, 0, '2026-04-17 13:40:29.458692+00', '2026-04-17 13:40:29.458692+00', true, 'asset', NULL, true, NULL),
	('019d9bac-160e-72c4-9147-214624cdc748', '019d5b2a-a710-7b68-baec-697183498367', 'Inter Account Transfers', NULL, NULL, NULL, 0, '2026-04-17 13:40:29.458692+00', '2026-04-17 13:40:29.458692+00', true, 'equity', NULL, true, NULL),
	('019d9bad-d8a6-7189-a841-64cbbf1b9cf8', '019d5b2b-02d7-7687-81a6-8aac5982fddf', 'Cash and Cash Equivalents', NULL, NULL, NULL, 0, '2026-04-17 13:42:32.965575+00', '2026-04-17 13:42:32.965575+00', true, 'asset', NULL, true, NULL),
	('019d9bad-dc9d-79be-8838-eb7030451663', '019d5b2b-02d7-7687-81a6-8aac5982fddf', 'Inter Account Transfers', NULL, NULL, NULL, 0, '2026-04-17 13:42:32.965575+00', '2026-04-17 13:42:32.965575+00', true, 'equity', NULL, true, NULL),
	('019d9bb7-d2cc-73fb-bfd4-6061170fef51', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'Retained Earnings', NULL, '019d9bb7-d0a9-79a9-9522-41d88fdbf91f', NULL, 0, '2026-04-17 13:53:26.096072+00', '2026-04-17 13:53:26.096072+00', true, 'equity', NULL, true, NULL),
	('019d9bb7-d518-728b-a5c5-b18df899a6d1', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'Net Profit (Loss)', NULL, NULL, NULL, 0, '2026-04-17 13:53:26.096072+00', '2026-04-17 13:53:26.096072+00', true, 'total', NULL, true, NULL),
	('019d9bb8-96d0-7297-9aed-ba55da84cb0b', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'Cash and Cash Equivalents', NULL, '019d9bb7-cd15-77eb-801d-097657dd4c62', NULL, 0, '2026-04-17 13:54:16.586016+00', '2026-04-17 13:54:16.586016+00', true, 'asset', NULL, true, NULL),
	('019d9bb8-9a00-74d4-87a5-8366ebb0ce14', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', 'Inter Account Transfers', NULL, '019d9bb7-d0a9-79a9-9522-41d88fdbf91f', NULL, 0, '2026-04-17 13:54:16.586016+00', '2026-04-17 13:54:16.586016+00', true, 'equity', NULL, true, NULL),
	('019d9bc5-82eb-7404-aa03-c53a1acfb3a0', '019d9bc5-7932-7178-996d-77cac88e22b1', 'Retained Earnings', NULL, '019d9bc5-80c6-71ce-9349-012f36a71956', NULL, 0, '2026-04-17 14:08:22.984992+00', '2026-04-17 14:08:22.984992+00', true, 'equity', NULL, true, NULL),
	('019d9bc5-872d-7bdf-9797-400acf64607c', '019d9bc5-7932-7178-996d-77cac88e22b1', 'Net Profit (Loss)', NULL, NULL, NULL, 0, '2026-04-17 14:08:22.984992+00', '2026-04-17 14:08:22.984992+00', true, 'total', NULL, true, NULL),
	('019d9bc6-4a51-7737-b705-89725aaab8ca', '019d9bc5-7932-7178-996d-77cac88e22b1', 'Cash and Cash Equivalents', NULL, '019d9bc5-7bb7-7ae1-a146-f18086c16274', NULL, 0, '2026-04-17 14:09:13.426029+00', '2026-04-17 14:09:13.426029+00', true, 'asset', NULL, true, NULL),
	('019d9bc6-4f7c-7839-8ae9-93e30d971896', '019d9bc5-7932-7178-996d-77cac88e22b1', 'Inter Account Transfers', NULL, '019d9bc5-80c6-71ce-9349-012f36a71956', NULL, 0, '2026-04-17 14:09:13.426029+00', '2026-04-17 14:09:13.426029+00', true, 'equity', NULL, true, NULL);


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."customers" ("id", "business_id", "name", "code", "billing_address", "delivery_address", "email", "created_at", "updated_at") VALUES
	('019d6580-1a16-7672-befc-b06c8e4f3b0c', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'farhan', NULL, NULL, NULL, NULL, '2026-04-07 01:13:06.77073+00', '2026-04-07 01:13:06.77073+00'),
	('019d651f-452a-79a5-96b3-b1c846bec006', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Farhan Ahmad', NULL, 'Central park Lahore', '361 A block new shalimar housing scheme Lahore', 'bookvault26@gmail.com', '2026-04-06 23:27:20.838806+00', '2026-04-07 02:44:00.688056+00');


--
-- Data for Name: receipts; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."receipts" ("id", "business_id", "date", "reference", "paid_by_type", "paid_by_contact_id", "paid_by_contact_type", "paid_by_other", "received_in_account_id", "description", "lines", "show_line_number", "show_description", "show_qty", "show_discount", "image_url", "created_at", "updated_at") VALUES
	('019d65d9-708a-70e1-b5b6-8957f5cc4fe7', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '2026-04-07', '1st', 'Contact', '019d651f-452a-79a5-96b3-b1c846bec006', 'customer', NULL, '019d64dd-a4fe-700c-9aaa-a9b2b928a472', 'This is my first receipt', '[{"qty": 10.0, "total": 1000.0, "amount": 100.0, "discount": null, "account_id": "019d6485-ec68-7c10-9f61-c62008f9f884", "line_description": null}, {"qty": 10.0, "total": 1000.0, "amount": 100.0, "discount": null, "account_id": "019d6485-ec68-7c10-9f61-c62008f9f884", "line_description": null}]', false, false, true, false, NULL, '2026-04-07 02:50:41.266071+00', '2026-04-07 15:07:37.087195+00'),
	('019d68c8-423e-7160-aa4c-0d788cd6221c', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '2026-04-07', NULL, 'Contact', '019d651f-452a-79a5-96b3-b1c846bec006', 'customer', NULL, '019d64dd-a4fe-700c-9aaa-a9b2b928a472', NULL, '[{"qty": 10.0, "total": 950.0, "amount": 100.0, "discount": 50.0, "account_id": "019d6485-ec68-7c10-9f61-c62008f9f884", "line_description": null}]', false, false, true, true, NULL, '2026-04-07 16:30:47.05514+00', '2026-04-07 16:48:47.126596+00'),
	('019d68cd-99c7-7522-b1c4-c15a0bd85d99', '019d605f-c771-7bf3-bd5b-2962586ec2bd', '2026-04-07', '1st', 'Contact', '019d651f-452a-79a5-96b3-b1c846bec006', 'customer', NULL, '019d68fc-cb54-7964-b77d-707e7056c0c6', 'This is a test receipt', '[{"qty": 10.0, "total": 450.0, "amount": 50.0, "discount": 50.0, "account_id": "019d6485-ec68-7c10-9f61-c62008f9f884", "line_description": null}]', false, false, true, true, NULL, '2026-04-07 16:36:36.958204+00', '2026-04-07 17:45:45.833017+00'),
	('019d9ba0-58da-7916-bf94-17ec5c2581b3', '019d9b9e-2f9b-7368-a385-682817f94e1d', '2026-04-17', NULL, 'Other', NULL, NULL, NULL, '019d9b9f-b428-7bf3-8cf5-909610313742', NULL, '[{"qty": null, "total": 100.0, "amount": 100.0, "discount": null, "account_id": "suspense", "line_description": null}]', false, false, false, false, NULL, '2026-04-17 13:27:48.793167+00', '2026-04-17 13:27:48.793167+00'),
	('019d9bb8-f977-7c2d-8bd9-d8712c73c73a', '019d9bb7-ca18-7ec8-bc3c-418d0e553ae0', '2026-04-17', NULL, 'Other', NULL, NULL, NULL, '019d9bb8-9168-76cc-bc1a-3e8fe9a9f05d', NULL, '[{"qty": null, "total": 100.0, "amount": 100.0, "discount": null, "account_id": "", "line_description": null}]', false, false, false, false, NULL, '2026-04-17 13:54:43.671941+00', '2026-04-17 13:54:43.671941+00'),
	('019d9bc6-ae6e-7651-ac13-192ff23a2f48', '019d9bc5-7932-7178-996d-77cac88e22b1', '2026-04-17', NULL, 'Other', NULL, NULL, NULL, '019d9bc6-413c-718d-9227-acc0509aff3a', NULL, '[{"qty": null, "total": 100.0, "amount": 100.0, "discount": null, "account_id": "", "line_description": null}]', false, false, false, false, NULL, '2026-04-17 14:09:41.858645+00', '2026-04-17 14:09:41.858645+00');


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."roles" ("id", "name", "description", "hierarchy_level", "is_system", "created_at", "updated_at") VALUES
	('019d5a2f-da15-731e-87eb-63ea15f25300', 'super_admin', 'Super Administrator with full system access', 10000, true, '2026-04-04 20:29:38.708133+00', '2026-04-06 01:15:35.780652+00'),
	('019d5a2f-da17-7d22-aca8-ae570c138d1e', 'admin', 'Admin user with access to the admin dashboard', 100, true, '2026-04-04 20:29:38.708133+00', '2026-04-06 01:15:35.780652+00');


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."suppliers" ("id", "business_id", "name", "code", "billing_address", "delivery_address", "email", "created_at", "updated_at") VALUES
	('019d655e-118b-72dd-8968-f4f3e7ba0d5e', '019d605f-c771-7bf3-bd5b-2962586ec2bd', 'Arham', NULL, NULL, NULL, NULL, '2026-04-07 00:35:56.366606+00', '2026-04-07 00:35:56.366606+00');


--
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_profiles" ("id", "user_id", "full_name", "avatar_url", "department", "created_at", "updated_at") VALUES
	('019d5a40-98ba-734f-acee-b4f6e9c7f479', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', 'Farhan Ahmad', NULL, NULL, '2026-04-04 20:47:56.077323+00', '2026-04-04 20:47:56.077323+00'),
	('019d5a44-565f-73ce-a1d8-6bfb1714de81', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', 'Farhan Ahmad', NULL, NULL, '2026-04-04 20:52:01.22718+00', '2026-04-04 20:52:01.22718+00'),
	('019d5f6d-5408-7072-96d3-2d2b7ad48126', '1a594084-34ee-4b05-9673-7a9d6316efc1', 'Book Vault', NULL, NULL, '2026-04-05 20:54:53.694237+00', '2026-04-05 20:54:53.694237+00');


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_roles" ("id", "user_id", "role_id", "created_at") VALUES
	('019d5a40-98c6-7ba1-940d-9e9f2874a12c', 'ccee6395-8832-4ca8-9576-8bdd5f034b5c', '019d5a2f-da15-731e-87eb-63ea15f25300', '2026-04-04 20:47:56.077323+00'),
	('019d5a44-566c-7f53-83bd-6008a0bd5c90', '174dcaf2-4429-4ac7-888b-8da6b31b8cf6', '019d5a2f-da17-7d22-aca8-ae570c138d1e', '2026-04-04 20:52:01.22718+00'),
	('019d5f6d-541a-7841-9def-e2659452ff05', '1a594084-34ee-4b05-9673-7a9d6316efc1', '019d5a2f-da17-7d22-aca8-ae570c138d1e', '2026-04-05 20:54:53.694237+00');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('receipts', 'receipts', NULL, '2026-04-07 02:10:28.719048+00', '2026-04-07 02:10:28.719048+00', false, false, 20971520, '{image/jpeg,image/png,image/webp,image/gif,application/pdf}', NULL, 'STANDARD');


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 97, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict bPme0ezwygvsacq8V1XmEX2QAmltZJVsGpOyva27rDSFJoT4hr6F9ifScCAoix0

RESET ALL;
