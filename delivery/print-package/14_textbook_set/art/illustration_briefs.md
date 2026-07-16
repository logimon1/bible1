# 공과책 일러스트 제작 명세

## 1과 디자인 V2 청소년 에디토리얼 삽화

- 파일: `art/generated/lesson01_truth_editorial_v2.png`
- 제작 방식: built-in image generation
- 용도: 중·고등부 학생책 표지와 도입면, 교사용 표지, 슬라이드 표지의 공통 키 비주얼
- 해상도: 1024×1536px

최종 프롬프트:

> Use case: illustration-story  
> Asset type: Korean middle/high-school Sunday-school textbook cover and lesson opener illustration  
> Primary request: Create an original contemporary editorial illustration about slowing down before assuming what a short group-chat reply means.  
> Scene/backdrop: a bright modern church youth-room table in soft daylight, simple uncluttered background.  
> Subject: three Korean teenagers, diverse boy and girls, gathered naturally around a table. One teen looks thoughtfully at a smartphone with an abstract unreadable chat interface; the other two listen with calm, supportive expressions instead of judging. On the table are an open book with only abstract line marks and three small stacks of blank color cards for fact, unknown explanation, and next loving action.  
> Style/medium: polished Korean youth educational publishing illustration; clean flat shapes, sophisticated graphic-novel/editorial character design, subtle colored-pencil and risograph grain; youthful but not childish, not anime, not photorealistic.  
> Composition/framing: vertical portrait 2:3. Keep the upper 28 percent calm and visually open for a title overlay. Put the character scene in the middle and lower portion; clear silhouettes; crop-safe for B5 cover and an interior landscape crop.  
> Lighting/mood: fresh, thoughtful, hopeful, relational.  
> Color palette: cobalt blue, soft lavender, warm yellow, coral, teal, and warm off-white; high contrast but controlled.  
> Constraints: no readable text anywhere; phone UI must be abstract blocks only; no logos, no QR codes, no watermark, no branded clothing, no magical glow, no armor, no weapons, no monsters, no floating symbols. The open book must have no readable letters. Hands and facial expressions should look natural.  
> Avoid: preschool clip art, bubble lettering, dark moody lighting, generic stock-photo look, hyperrealism, excessive detail, childish proportions.

## 1과 디자인 V2 경청 스팟 삽화

- 파일: `art/generated/lesson01_truth_listening_spot_v2.png`
- 제작 방식: built-in image generation, V2 키 비주얼을 캐릭터·화풍 앵커로 사용
- 용도: 학생책 대화 연습면과 교사용 적용 지도
- 해상도: 1536×1024px

최종 프롬프트:

> Use case: illustration-story  
> Asset type: interior spot illustration for the same Korean middle/high-school Sunday-school textbook  
> Input images: Image 1 is the character and visual-style anchor from the lesson cover.  
> Primary request: Continue with the same three teenagers and exactly the same mature Korean youth editorial illustration style. Show a supportive listening moment: the teen in the cobalt hoodie is speaking quietly about a disappointing result, while the two friends listen without judging; one friend gently asks a question and the other leaves space for him to choose whether to continue.  
> Scene/backdrop: the same bright church youth-room table and daylight atmosphere, simplified.  
> Style/medium: match Image 1's character faces, hair, clothing colors, colored-pencil and soft editorial texture.  
> Composition/framing: horizontal 3:2 close medium shot, all three faces and natural hands visible, ample clean negative space on the right for a short worksheet prompt.  
> Lighting/mood: warm, safe, attentive, hopeful.  
> Color palette: cobalt, lavender, yellow, coral, teal, warm off-white, matching Image 1.  
> Constraints: preserve the same character identities and age; no readable text, no speech bubbles, no phone screen text, no logos, no QR codes, no watermark, no magic, no armor, no weapons, no monsters. Keep body proportions realistic and suitable for teens.  
> Avoid: childish proportions, anime exaggeration, dark counseling-room mood, hugging or melodrama, extra people or objects.

## 공통 아트 디렉션

- 용도: B5 학생책 차시 도입 2쪽 펼침, 교사용 슬라이드 16:9 크롭
- 스타일: 한국 중·고등부 교재에 맞는 현대적 에디토리얼 일러스트, 선명한 형태, 따뜻한 표정, 색연필·리소그래프 계열의 인쇄 친화적 질감
- 캐릭터: 한국 중·고등학생 4명, 성별과 헤어스타일이 다양하며 실제 학교 생활에 가까운 복장
- 분위기: 밝고 진지하며 교회 친화적. 유치한 SD 캐릭터나 과도한 일본 애니메이션 문법을 피함
- 팔레트: cobalt `#4B4ACF`, lavender `#E9E7FB`, sun `#F5C84C`, coral `#E9655A`, teal `#16998F`, warm paper `#FBFAF7`
- 상징: 갑주를 실제 전투 장비로 입히지 않고 선, 카드, 길, 지도처럼 생각과 선택을 보여 주는 편집 모티프로 번역
- 금지: 텍스트, 말풍선, 실제 QR, 교회 로고, 특정 브랜드, 공포, 괴물, 폭력, 무기 공격, 선정적 복장, 워터마크
- 편집 여백: 제목과 질문을 넣을 수 있도록 한쪽 상단에 단순한 음영의 여백 확보
- 반복성: 4과 전체에서 얼굴, 체형, 교복/캐주얼 복장, 색 배치를 유지

## 캐릭터 앵커

- 민서: 짧은 검은 단발, 네이비 후드, 관찰력이 좋지만 성급히 자신을 탓하는 경향
- 준호: 웨이브가 있는 짧은 머리, 포리스트색 셔츠, 질문으로 사실 확인을 돕는 역할
- 서연: 긴 머리를 낮게 묶음, 크림색 재킷, 다른 사람의 말을 끝까지 듣는 역할
- 도윤: 자연스러운 곱슬머리, 민트색 포인트, 도움을 요청하고 팀을 연결하는 역할

## 1과 메인 장면 - 답장이 짧아진 이유

- 장소: 방과 후 교회 청소년부 라운지 또는 밝은 스터디 공간
- 행동: 민서가 짧은 답장이 보이는 휴대폰을 내려다보며 걱정하고, 준호와 서연이 화면을 캐묻지 않고 옆에서 사실을 확인하자는 차분한 태도를 보임
- 상징: 탁자 위 세 묶음의 빈 카드와 배경의 엉킨 선이 곧은 선으로 이어지는 편집 모티프. 인물 주변의 마법 빛은 사용하지 않음
- 구도: B5 세로 크롭 가능, 인물 3명은 하단 2/3, 왼쪽 상단 또는 오른쪽 상단에 제목 여백
- 핵심: 채팅 내용은 읽을 수 없는 추상 막대로 처리하고 실제 메시지 문구를 생성하지 않음

## 2과 메인 장면 - 다시 준비하자

- 장소: 교실 발표가 끝난 직후
- 행동: 발표 실수 후 고개 숙인 학생에게 친구들이 평가하거나 영웅처럼 구하는 대신, 자료를 함께 정리하며 다시 준비하자고 손을 내밈
- 상징: 가슴 앞의 은은한 흉배 빛과 발밑에서 다음 자리로 이어지는 민트색 길
- 핵심: 실패를 지우지 않고 회복과 평안을 선택하는 공동체

## 3과 메인 장면 - 함께 드는 방패

- 장소: 현실과 상징이 겹친 비바람 속 갈림길
- 행동: 학생 4명이 하나의 큰 방패를 함께 받쳐 바람을 막고, 다른 손으로 서로와 길 표지판을 확인
- 상징: 방패 표면에 금빛 십자형 빛, 머리 위에는 구원의 투구를 암시하는 따뜻한 빛
- 금지: 적, 화살의 직접 공격, 전투 승리 포즈

## 4과 메인 장면 - 말씀 지도로 찾는 길

- 장소: 어두워지기 시작한 숲길의 갈림길
- 행동: 네 학생이 공격용 칼 대신 빛나는 지도처럼 펼쳐진 말씀 상징을 함께 보고 다음 길을 선택하며, 한 학생은 조용히 기도
- 상징: 성령의 검 실루엣은 지도 가장자리의 빛으로만 암시, 길 끝은 따뜻한 새벽빛
- 핵심: 말씀과 기도가 공동체의 순종을 이끈다는 장면

## 생성 순서

1. 1과 장면으로 스타일·인물·채도 파일럿
2. 승인된 1과를 캐릭터 앵커로 사용해 2~4과 생성
3. 과별 보조 컷 2장씩 생성
4. 인쇄 크롭, 피부·손·휴대폰·의상 연속성 검수
5. 편집 파일에는 이미지와 텍스트를 분리해 배치

## 1과 최종 편집 프롬프트

아래 내용은 V1 제작 이력 보존용입니다. V2 PDF에는 사용하지 않습니다.

`lesson01_truth_opening_final.png`은 `lesson01_truth_opening_v1.png`을 편집 대상으로 사용해 Codex 기본 내장 이미지 생성의 `precise-object-edit` 방식으로 만들었습니다.

```text
Use case: precise-object-edit
Asset type: final B5 youth Bible study opening illustration
Input images: Image 1 is the edit target and must otherwise remain unchanged.
Primary request: remove only the overt magical visualization: remove the glowing gold ring circling the center student's waist, remove the small glowing circles, and remove the colored paper fragments floating on and around the center student's hoodie.
Replacement detail: place three small, tidy groups of ordinary colored sticky notes flat on the table in the foreground, using muted mint, cream-gold, and restrained coral. The notes must contain no text. They should look like normal classroom materials, not glowing or magical.
Constraints: preserve the exact three students, faces, expressions, hairstyles, clothing, poses, hands, smartphone, room, furniture, plants, lighting, framing, palette, paper texture, and large blank wall space; change only the magical ring/circles/floating fragments and their replacement on the table; no readable text; no logos; no watermark; no QR; no weapons; no fantasy effects.
```

## 1과 V1 생성 프롬프트 - 이력 보존

```text
Use case: illustration-story
Asset type: B5 youth Bible study opening illustration, reusable as a 16:9 teacher slide crop
Primary request: a thoughtful scene about separating facts from assumptions after receiving a very short group-chat reply
Scene/backdrop: bright after-school church youth lounge that also feels like a contemporary study room; no religious logos
Subject: three Korean middle/high-school students. A student with a short black bob and navy hoodie looks worried while looking down at a smartphone. Two friends sit nearby with calm, supportive body language, helping the student pause and check the facts without invading the phone.
Style/medium: polished editorial graphic-novel illustration mixed with modern board-game art; clean shapes, subtle paper texture, youth-friendly but not childish; print-ready
Composition/framing: portrait-friendly scene, three students in the lower two-thirds, uncluttered negative space in one upper corner for later layout text; smartphone screen content must be abstract unreadable bars
Lighting/mood: warm late-afternoon window light; reflective, safe, hopeful
Color palette: deep forest green, navy, warm gold, cream, mint, restrained coral accents
Symbolic detail: a subtle warm-gold belt-shaped light around the worried student's waist gently organizes a few abstract floating thought fragments into three orderly groups; metaphorical and understated, not magical combat armor
Constraints: age-appropriate modest clothing; natural hands; consistent realistic teen proportions; no readable text; no speech bubbles; no actual QR; no logos; no watermark; no monsters; no weapons; no fighting; no dark fantasy; no melodramatic crying
```
