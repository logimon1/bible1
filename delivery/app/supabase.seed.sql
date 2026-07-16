-- Generated from config/program.config.json. Re-run npm run export:seed-sql after config changes.
begin;

insert into programs (id, program_mode, church_name, event_name, event_start_date, event_end_date, participant_limit, team_mode, settings)
values ('default', 'retreat', '샘플교회', '전신갑주 QR RPG 운영 세트', '2026-07-24'::date, '2026-07-26'::date, 80, true, '{"rewardPolicy":{"drawCounts":[1,2,3],"duplicatePolicy":"once_per_participant_per_mission","talentPerMission":10,"retreatSpeed":"fast","monthlySpeed":"weekly"},"missionUnlockPolicy":{"retreat":"manual_or_always","monthly":"week_index","allowPastWeeks":true,"lockFutureWeeks":true},"exchangeSettings":{"boothCount":2,"maxItemsPerTrade":2,"expiresMinutes":10,"teacherConfirmed":true},"adminSettings":{"adminCodeEnv":"ADMIN_PIN","allowReset":true,"allowCsvExport":true,"allowManualRewards":true},"currentWeek":1}'::jsonb)
on conflict (id) do update set
  program_mode = excluded.program_mode,
  church_name = excluded.church_name,
  event_name = excluded.event_name,
  event_start_date = excluded.event_start_date,
  event_end_date = excluded.event_end_date,
  participant_limit = excluded.participant_limit,
  team_mode = excluded.team_mode,
  settings = excluded.settings,
  updated_at = now();

insert into equipment (id, name, verse, description, effect, unlock_condition, print_text)
values ('belt', '진리의 허리띠', '에베소서 6:14', '거짓을 분별하고 진리 위에 서는 장비입니다.', '거짓 분별 미션에서 힌트를 얻습니다.', '1주차 또는 진리 미션 완료', '진리로 마음을 단단히 묶으세요.')
on conflict (id) do update set
  name = excluded.name,
  verse = excluded.verse,
  description = excluded.description,
  effect = excluded.effect,
  unlock_condition = excluded.unlock_condition,
  print_text = excluded.print_text;

insert into equipment (id, name, verse, description, effect, unlock_condition, print_text)
values ('breastplate', '의의 흉배', '에베소서 6:14', '정죄와 죄책감에서 마음을 지키는 장비입니다.', '정죄 미션에서 실패 부담을 줄입니다.', '1주차 또는 의 미션 완료', '예수님의 의로 마음을 지키세요.')
on conflict (id) do update set
  name = excluded.name,
  verse = excluded.verse,
  description = excluded.description,
  effect = excluded.effect,
  unlock_condition = excluded.unlock_condition,
  print_text = excluded.print_text;

insert into equipment (id, name, verse, description, effect, unlock_condition, print_text)
values ('shoes', '평안의 복음의 신', '에베소서 6:15', '복음을 전하는 발걸음을 상징합니다.', '이동/전달 미션에서 시간을 얻습니다.', '2주차 또는 복음 미션 완료', '복음의 평안을 들고 걸어가세요.')
on conflict (id) do update set
  name = excluded.name,
  verse = excluded.verse,
  description = excluded.description,
  effect = excluded.effect,
  unlock_condition = excluded.unlock_condition,
  print_text = excluded.print_text;

insert into equipment (id, name, verse, description, effect, unlock_condition, print_text)
values ('shield', '믿음의 방패', '에베소서 6:16', '두려움과 의심을 막는 장비입니다.', '마귀 방해를 한 번 막습니다.', '3주차 또는 믿음 미션 완료', '믿음으로 두려움을 막으세요.')
on conflict (id) do update set
  name = excluded.name,
  verse = excluded.verse,
  description = excluded.description,
  effect = excluded.effect,
  unlock_condition = excluded.unlock_condition,
  print_text = excluded.print_text;

insert into equipment (id, name, verse, description, effect, unlock_condition, print_text)
values ('helmet', '구원의 투구', '에베소서 6:17', '구원의 확신과 정체성을 지키는 장비입니다.', '혼란 미션에서 보기 하나를 제거합니다.', '3주차 또는 구원 미션 완료', '구원의 확신으로 생각을 지키세요.')
on conflict (id) do update set
  name = excluded.name,
  verse = excluded.verse,
  description = excluded.description,
  effect = excluded.effect,
  unlock_condition = excluded.unlock_condition,
  print_text = excluded.print_text;

insert into equipment (id, name, verse, description, effect, unlock_condition, print_text)
values ('sword', '성령의 검', '에베소서 6:17', '하나님의 말씀으로 싸우는 장비입니다.', '말씀 미션에서 추가 힌트를 얻습니다.', '4주차 또는 말씀 미션 완료', '말씀으로 오늘의 선택을 세우세요.')
on conflict (id) do update set
  name = excluded.name,
  verse = excluded.verse,
  description = excluded.description,
  effect = excluded.effect,
  unlock_condition = excluded.unlock_condition,
  print_text = excluded.print_text;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('mission-truth', 'default', 'retreat', 'opening', 1, '진리 분별 미션', '말씀과 상황 카드 중 거짓을 분별합니다.', '에베소서 6:14', 'belt', '{"draws":1,"talent":10}'::jsonb, '이번 주 내가 붙들어야 할 진리는 무엇인가요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('mission-righteousness', 'default', 'monthly', 'week1', 1, '의의 고백 미션', '정죄의 문장을 복음적 고백으로 바꿉니다.', '에베소서 6:14', 'breastplate', '{"draws":1,"talent":10}'::jsonb, '나는 어떤 말로 내 정체성을 흔들리게 하나요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('mission-gospel', 'default', 'monthly', 'week2', 2, '복음의 발걸음 미션', '한 사람에게 격려와 복음의 메시지를 전합니다.', '에베소서 6:15', 'shoes', '{"draws":1,"talent":12}'::jsonb, '이번 주 내가 복음의 평안을 전할 사람은 누구인가요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('mission-faith', 'default', 'retreat', 'forest', 3, '믿음의 방패 미션', '두려움 카드 앞에서 믿음의 선택을 고백합니다.', '에베소서 6:16', 'shield', '{"draws":1,"talent":10}'::jsonb, '내가 믿음으로 막아야 할 두려움은 무엇인가요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('mission-salvation', 'default', 'monthly', 'week3', 3, '구원의 확신 미션', '구원 확신과 정체성 문장을 맞춥니다.', '에베소서 6:17', 'helmet', '{"draws":1,"talent":12}'::jsonb, '하나님이 나를 어떤 사람으로 부르셨나요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('mission-word', 'default', 'retreat', 'boss', 4, '성령의 검 미션', '말씀 구절을 찾아 오늘의 선택에 적용합니다.', '에베소서 6:17', 'sword', '{"draws":1,"talent":15}'::jsonb, '이번 주 내 선택을 이끌 말씀은 무엇인가요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('hidden-forest-cache-1', 'default', 'retreat', 'hidden', 1, '숨겨진 갑주 보급품 1', '갑주 도전 중 발견하는 히든 QR 보상입니다.', '에베소서 6:13', 'shield', '{"draws":2,"talent":10}'::jsonb, '어려움 속에서도 붙드는 믿음은 무엇인가요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('hidden-verse-cache-2', 'default', 'retreat', 'hidden', 1, '숨겨진 말씀 조각', '말씀 조각을 찾는 보너스 QR입니다.', '시편 119:105', 'sword', '{"draws":0,"talent":15}'::jsonb, '말씀은 나의 길에서 어떤 빛이 되나요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)
values ('boss-forest', 'default', 'retreat', 'boss', 4, '최종 결단 미션', '전신갑주를 확인하고 마지막 결단을 고백합니다.', '에베소서 6:13', 'sword', '{"draws":3,"talent":20}'::jsonb, '수련회 이후 내가 지킬 결단은 무엇인가요?', true)
on conflict (code) do update set
  program_id = excluded.program_id,
  mode = excluded.mode,
  phase = excluded.phase,
  week_index = excluded.week_index,
  title = excluded.title,
  short_description = excluded.short_description,
  verse = excluded.verse,
  armor_code = excluded.armor_code,
  reward = excluded.reward,
  small_group_question = excluded.small_group_question,
  active = excluded.active;

insert into exchange_sessions (booth_id, status)
values (1, 'empty'), (2, 'empty')
on conflict (booth_id) do nothing;

commit;
