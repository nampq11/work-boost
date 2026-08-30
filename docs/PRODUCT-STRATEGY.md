# Work Boost - Product Strategy

> **Tài liệu chiến lược sản phẩm duy nhất.** Tổng hợp từ: nghiên cứu thị trường, nghiên cứu vấn đề người dùng, và tầm nhìn sản phẩm.
> Mục đích: trả lời "chúng ta đang xây gì, cho ai, vì sao thắng" và là la bàn cho mọi quyết định feature. Nếu một feature không phục vụ chiến lược này, không nên làm.
> **Cấu trúc bám theo khung chuẩn:** Vision + Principles -> Market/Segment -> Needs -> Standout features -> Business goals -> Strategy drivers -> Roadmap (outcome-based) + North-star metric.

---

## 1. Tóm tắt (Executive Summary)

**Work Boost là báo cáo công việc hằng ngày của bạn, được AI viết tự động và gửi tới đúng nơi bạn làm việc - dữ liệu nằm trong tay bạn, dưới dạng file Markdown.**

Nó đứng ở một bài toán **khác** với hubble.md (nguồn cảm hứng) hay Notion/Obsidian:
- hubble.md là "notepad cho bạn và agents" - **thụ động** (bạn/agent ghi, app live-reload).
- Work Boost là **"công việc của tôi tự báo cáo lại cho tôi"** - **chủ động + trí nhớ bền + báo cáo đáng tin + đẩy tới nơi tôi làm việc**.

Nghiên cứu xác nhận: pain point mạnh nhất (offline / "my data is mine" / chống lock-in) được Work Boost phản hồi đúng. Nhưng có 3 gap nội bộ cần sửa trước khi mở rộng, trong đó **chất lượng daily summary là quan trọng nhất**.

---

## 2. Sản phẩm và nguồn gốc

### 2.1 Nguồn gốc: hai mảnh ghép
- **Nỗi đau gốc (nhân tố PROACTIVE):** bạn bắt đầu vì mỗi sáng phải viết báo cáo công việc lên group Slack. Đây không phải "note-taking" mà là *"đừng bắt tôi viết báo cáo - hãy để AI viết nó, đúng nơi tôi đang làm việc"*.
- **hubble.md (nhân tố LOCAL-FIRST + MARKDOWN):** "notepad cho bạn và agents" - markdown-first, open source, agent-ready, HTML apps view. Nhưng **thụ động**, không chủ động gửi thông tin cho bạn.

### 2.2 Đặc điểm sản phẩm hiện tại
- Local-first personal AI workspace, markdown-first (workspace là nguồn dữ liệu gốc, no cloud, no account).
- AI-first, provider-agnostic (Z.ai, OpenAI Codex, OpenRouter, Gemini; credential local).
- Đa kênh: desktop app (Tauri 2), browser, Slack, Telegram.
- Tính năng: chat AI, debt tracking trong chat, task/daily-work, daily AI report, subscription & scheduling.
- Mở rộng được (extensions/webhooks/cron), open source (MIT), free.

### 2.3 Khác biệt cốt lõi

| | hubble.md | Work Boost |
|---|---|---|
| Dữ liệu | Markdown, local-first | Markdown, local-first |
| Agent | Agent ghi vào notes | AI chủ động **báo cáo lại cho bạn** |
| Push | Thụ động (bạn mở app) | **Chủ động** (gửi đến Slack/Telegram) |
| Kênh | Desktop / browser | Desktop + browser + **Slack + Telegram** |
| Điểm độc nhất | HTML apps, build-any-view | **Debt tracking trong chat** |

---

## 3. Thị trường (Market Research)

### 3.1 Quy mô (TAM / SAM / SOM)
Nằm ở giao điểm 3 thị trường đều tăng trưởng mạnh:

| Thị trường | 2025 | 2026 | 2030 | CAGR |
|---|---|---|---|---|
| AI productivity tools | $13.61B | $17.01B | $41.12B | ~25% |
| Personal AI assistant | - | - | +$12.36B (2026-2030) | ~35% |
| Note-taking apps | $11.02B | $13.3B | $28.05B | ~20.5% |

Nguồn: The Business Research Company, Technavio (2026).

- Personal AI assistant là thị trường khớp nhất với "daily work assistant", tăng nhanh nhất (~35% CAGR).
- Cấu trúc thị trường **fragmented** - có chỗ cho người mới khác biệt, nhưng có nhiều ông lớn (Apple, Google, Microsoft...).
- **Thẳng thắn:** SOM rất nhỏ. Work Boost là tool cá nhân, không phải công ty tiêu dùng đại chúng. **PMF ở đây = một nhóm người dùng trung thành, nhỏ nhưng sâu**, không phải thị phần lớn. Đừng để số TAM hàng chục tỷ USD dẫn lối.

### 3.2 Bức tranh đối thủ (4 nhóm)
- **A - AI note-taking / second brain:** Notion AI (Free/$10/$20), Mem AI ($14.99, không offline), Reflect (paid $10-15, E2E), Obsidian/Logseq (free, local-first - **đối thủ thực sự nhất** về triết lý file-over-app).
- **B - Memory / recording:** Rewind AI (Pro $19, local processing), Limitless/Granola/Otter (tóm tắt cuộc họp).
- **C - Chat-channel assistant:** OpenClaw (dẫn đầu, proactive, ~24 nền tảng, credential local, prompt-injection out-of-scope), QwenPaw, Hermes, AnythingLLM, Jan.ai, Leon, PyGPT. Telegram bots khác đều **reactive**.
- **D - AI personal finance:** Cleo (chatbot), Copilot/Monarch/Rocket (predictive, qua Plaid - lộ dữ liệu), Finny (AI-input, local).

### 3.3 "Mỏ vàng" positioning: tranh cãi Notion 2025-2026
5 tranh cãi là tín hiệu trực tiếp nhất cho Work Boost:
1. Hủy AI add-on, gói vào Business $20/tháng - người dùng: "AI không đáng trả tiền, nhiều lựa chọn free". **Willingness-to-pay ceiling.**
2. Offline giới hạn (50-row cap, 1 view, subpage không tải đệ quy, AI/automation không chạy offline) - người dùng chạy sang Obsidian vì "speed và local-first", rồi yêu **file-over-app**.
3. Breaking API change 09/2025 - phá n8n, Retool integration.
4. **Prompt injection / data exfiltration (Notion 3.0 AI Agent)** - "lethal trifecta" (private data + untrusted content + external communication). Luận cứ mạnh nhất cho privacy/local-first.
5. Notion Sites SEO noindex bug + lộ email editor.

**Điểm cốt lõi:** người dùng rời Notion không chỉ vì privacy, mà vì **file-over-app** (tự do script, automation, tránh lock-in). Đây là PMF tiềm năng của Work Boost.

---

## 4. Vấn đề người dùng (User Problem Validation)

> **Phương pháp:** dùng `warp-cli connect` (Cloudflare WARP) để vượt chặn mạng; scrape qua API công khai.

| Nguồn | Qua WARP | Cách lấy |
|---|---|---|
| Hacker News (Algolia) | ✅ mạnh nhất | `hn.algolia.com/api/v1/search` - search cả comment (nơi có quote user thật) |
| GitHub Issues | ✅ | `api.github.com/search/issues` (rate 10/min) |
| Reddit `.json` | ❌ 403 bị chặn bot | thử `.rss` (đôi khi 200) hoặc mirror |

**Cảnh báo chất lượng:** quote trực tiếp từ HN là dữ liệu tốt. Nhưng một phần nguồn tổng hợp là vendor/competitor tự viết (SplitPilot, Vellum, ClawTank, Finny) - có bias. Reddit/X chưa scrape được. Trước khi pivot lớn, nên phỏng vấn 5-10 user thật.

### 4.1 Bằng chứng trực tiếp từ user (quote thật, HN)
**Offline / "my data should be mine" (mạnh nhất):**
- *"The only copy of my data should not exist solely in an app's cloud, and I should not need to manually export anything."*
- *"Offline mode. My data is mine... Without this 'feature' I will never use Notion."*
- *"I used to use Notion, but the lack of offline mode, even after all these years, made me decide to look for alternatives. I thought about Obsidian, but there isn't a simple, free way to sync..."*
- *"If you start a Notion variation, let me know. I would love something like Notion but offline and secure."*

**Daily summary của chính mình (nhu cầu thật):**
- *"I feed the transcript to a dedicated Claude project and ask it to give me a summary in a specific format I define, with good front matter..."* - người dùng phải tự chế workflow.

**Debt / bạn bè chia tiền (nhu cầu & phức tạp thật):**
- *"The main problem seems people do not know the many solutions that already exist... splitting the bill sucks. Either someone doesn't have cash or..."*
- Jon (nhân viên Splitwise): *"...we want to keep things casual. The 'debt simplification' is an awesome feature but is not on by default because some people have differing levels of trust..."*

### 4.2 Map pain point -> code -> hành động

| # | Pain point (xác nhận) | Trạng thái trong code | Hành động |
|---|---|---|---|
| 1 | "My data is mine" / privacy | ✅ Đã giải (loopback, no cloud, local credential) | Giữ & làm nổi bật; thêm "local model" để đứng vững camp privacy |
| 2 | Offline / file-over-app / chống lock-in | ✅ Đã giải (markdown authoritative, no export) | Giữ; kể rõ câu chuyện "escape Notion" |
| 3 | Paywall creep / free | ✅ Đã giải (free, MIT) | Lợi thế phân phối; nhưng cần pricing nhẹ để đo intent |
| 4 | Proactive > reactive | ✅ Đã có scheduler | Giữ; đảm bảo lịch + reminder mặc định tốt |
| 5 | Daily summary chất lượng | ⚠️ Gap (nối chuỗi + 1 lần gọi LLM) | Thêm grounding/verify; phân cấp quan trọng; fallback khi dữ liệu mỏng |
| 6 | Trí nhớ hội thoại bền | ⚠️ Gap (in-memory, TTL 24h, mất khi restart) | Ghi transcript xuống workspace (markdown) |
| 7 | Setup kỹ thuật cao | ⚠️ Gap | Hạ rào cản: onboarding tự động, hướng dẫn webhook bằng UI |
| 8 | Debt group settlement | ⚠️ Gap (chỉ 1:m) | Thêm group + debt simplification + settlement theo nhóm |

### 4.3 Các gap nội bộ (từ code)
- **#5 Daily summary "good-enough isn't enough":** `extensions/scheduler/daily-job.ts` chỉ nối chuỗi message rồi gọi LLM một lần: `"Hãy tổng hợp công việc hôm nay dựa trên các tin nhắn sau: ${messages...}"`. Không grounding, không verify, không phân cấp quan trọng. LLM có thể thêm việc không tồn tại; chất lượng phụ thuộc lượng dữ liệu. *(Đây là giá trị cốt lõi của sản phẩm nhưng là điểm yếu kỹ thuật nhất.)*
- **#6 Trí nhớ hội thoại không bền:** `packages/brain/src/sessions.ts` là Map in-memory, `maxMessages=50`, TTL 24h, **mất khi restart**. Trái với positioning "local-first + markdown" - nên lưu transcript xuống workspace như file.
- **#8 Debt thiếu group settlement:** `packages/brain/src/tools/debt.ts` chỉ làm 1:m (personName/amount/direction/reason). Chưa có nhóm nhiều người, debt simplification, settlement theo nhóm.

---

## 5. Định vị & khác biệt hóa

**Điểm mạnh / được xác nhận:** markdown-first file-over-app (khớp lý do rời Notion), local-first đa kênh, proactive daily report (chỉ TheTop/OpenClaw làm tốt), free + open source.

**Mâu thuẫn lớn nhất cần giải quyết:** Work Boost quảng cáo "local-first / privacy" nhưng AI gửi dữ liệu lên cloud provider (Z.ai, OpenRouter, Gemini...). Điều này "quietly undoes" lý do chọn local storage - sẽ mất phân khúc privacy-sensitive (phân khúc quan trọng nhất trong positioning).

Mâu thuẫn phụ:
- Model-agent trách nhiệm có thể tái tạo "lethal trifecta" nếu không giới hạn outbound.
- Daily report dựa trên ghi chú trong workspace, không phải email/calendar - khác bài toán TheTop/NotebookLM, nên dễ bị xem là phụ.
- Debt nếu đẩy mạnh sẽ rơi vào nhóm D (Cleo/Monarch), mất tính "daily work assistant".

---

## 6. Strategy Drivers - VÌ SAO chọn "REPORTING" (rationale, phần lõi)

> Phần này là điểm khác biệt giữa "có strategy" và "chỉ có danh sách tính năng". Nó nói rõ **ta chọn hướng nào, vì lý do gì, và ta đã từ chối hướng nào**. Không có phần này, strategy chỉ là sự thật (market, đối thủ, quote) chứ không phải lựa chọn.

### 6.1 Lựa chọn trung tâm
**Chọn trục "daily work companion (local-first, proactive reporting)".** Các hướng khác được cân nhắc và từ chối có lý do.

### 6.2 Bằng chứng (insight) dẫn tới lựa chọn
1. **Nỗi đau gốc của bạn là proactive reporting** (viết báo cáo mỗi sáng), không phải note-taking. Đây là bài toán bạn đã tự trải nghiệm, không phải đoán.
2. **Pain point mạnh nhất được xác nhận bằng quote thật** = offline / "my data is mine" / chống lock-in, giải thích bằng **file-over-app** chứ không chỉ privacy. Đây là lý do người rời Notion.
3. **Làn sóng thị trường đang diễn ra** - người dùng chủ động rời Notion/cloud sang local-first. Ta không cần thuyết phục họ chuyển đổi, chỉ cần là điểm đến tốt.
4. **Khác biệt cạnh tranh** - các bot hiện hữu chủ yếu *reactive*; chỉ OpenClaw/TheTop làm *proactive*. "Proactive daily report + trí nhớ bền + đáng tin" là khoảng trống chưa ai chiếm.
5. **Đa kênh** - "đúng nơi tôi làm việc" hạ rào cản adoption so với app phải mở.

### 6.3 Các hướng ĐÃ TỪ CHỐI (và vì sao)
| Hướng từ chối | Lý do từ chối |
|---|---|
| **"Notion mới" / second brain đầy đủ** | Thị trường đông đúc (Notion, Obsidian, hubble.md, Reflect); ta không có lợi thế, và bài toán đó là note-taking chứ không phải nỗi đau gốc của bạn. |
| **Công cụ AI finance / budgeting** (đẩy mạnh debt) | Rơi vào nhóm Cleo/Monarch/Copilot; mất tính "daily work assistant"; và market đã có người làm tốt hơn. |
| **Assistant đa năng / chatbot thông thường** | Quá rộng, không có "reason to be" - Bassino gọi đây là "wrong play level" (danh sách 40 sáng kiến hoặc mục tiêu quá cao). |

**Kết luận của mục này:** Ta chọn "reporting", không phải "note-taking", không phải "finance", không phải "chatbot đa năng". Mọi feature phải phục vụ trục này; những thứ tạo ra sự cộng hưởng (debt, chat, task) là *feature bổ trợ*, không phải trục.

---

## 7. Đánh giá Product-Market Fit

### Tín hiệu tích cực
- **[TRUE] Strong differentiator** - file-over-app + local-first + đa kênh, khớp lý do người rời Notion.
- **[TRUE] Niche rõ ràng** - "một nơi cho mọi thứ trong ngày làm việc của tôi".
- **[TRUE] Được chứng minh bởi chuyển dịch thị trường** - làn sóng rời Notion/cloud sang local-first đang diễn ra.

### Tín hiệu yếu / rủi ro
- Monetization chưa rõ (free/open source hoàn toàn) - xem mục 8 (Business Goals).
- Mâu thuẫn local-first vs cloud AI.
- Tín hiệu kéo (pull) chưa đo được.
- TAM vĩ mô lớn nhưng SOM nhỏ.
- Bị kẹp giữa "note app" và "finance".

### North-star metric (thước đo PMF đúng)
Không phải số lần cài đặt. Đúng là:
- **WAU = người dùng mở daily report đúng giờ HOẶC chat với agent, ít nhất 5 ngày/tuần.**
- **% ngày user có báo cáo tự động được tạo và đọc** (không phải tự gõ).

Nếu user vẫn phải tự viết báo cáo hoặc bỏ qua báo cáo, chưa PMF.

---

## 8. Business Goals

> Pichler hỏi: "sản phẩm đem lại lợi ích gì cho công ty?". Đây là lựa chọn cốt lõi mà khung strategy yêu cầu trả lời.

**✅ Quyết định (đã chọn): Nhánh B - Sản phẩm thu phí nhẹ (personal tool, có monetization).**

### 8.1 Mục tiêu kinh doanh
Giữ tinh thần local-first, nhưng **thu phí nhẹ** (donate hoặc optional tier cho hosted AI / advanced features) để đo willingness-to-pay và phân đoạn, đồng thời có nguồn lực phát triển và không hoàn toàn phụ thuộc chi phí cloud model.

### 8.2 Nhánh đã cân nhắc và lý do chọn B
| Nhánh | Trạng thái |
|---|---|
| **B - thu phí nhẹ** | ✅ Đã chọn |
| A - personal free (không monetization) | ❌ Không chọn - gần như không doanh thu, phụ thuộc thời gian cá nhân, khó bền vững nếu muốn toàn thời gian. |

### 8.3 Điểm mạnh / rủi ro đã biết
- **Điểm mạnh:** đo được PMF intent; có nguồn lực; không phụ thuộc hoàn toàn chi phí cloud.
- **Điểm yếu / rủi ro:** **willingness-to-pay ceiling thấp** (Notion AI $20 bị chê "không đáng trả") - khó thu phí cao; rủi ro phản cảm với group "free/open source".

### 8.4 Hệ quả chiến lược của việc chọn B
1. **Local model (Ollama/LM Studio) trở nên quan trọng hơn** - giúp giảm chi phí hosting AI để giữ biên lợi nhuận, đồng thời củng cố lời hứa privacy trong positioning.
2. **Cần một pricing model rõ ràng** - tối thiểu một optional paid tier để đo intent; miễn là không phá vỡ lời hứa "local-first".
3. **Không bị phản cảm bởi "open source"** - giữ MIT cho core, thu phí cho phần hosted/advanced.
4. **Báo cáo + trí nhớ bền + đáng tin là tiền đề để thu phí** - user chỉ trả tiền nếu giá trị cốt lõi (báo cáo đáng tin) thực sự chạy tốt. Củng cố Ưu tiên 1 là con đường ngắn nhất tới doanh thu.

---

## 9. Tầm nhìn (Vision)

> **"Công việc của bạn tự báo cáo lại cho bạn. Dữ liệu của bạn nằm trong tay bạn."**
>
> *"Hằng ngày, công việc của tôi tự viết báo cáo thay tôi - ở đúng nơi tôi đã làm việc (Slack/Telegram), lưu dưới dạng Markdown tôi làm chủ."*

### Bốn trụ cột để mọi feature bám theo
1. **Local-first / data ownership** - "dữ liệu của bạn nằm trong tay bạn". (Trụ nền, pain point mạnh nhất được xác nhận.)
2. **Proactive daily reporting** - "công việc tự báo cáo, bạn không cần viết". (Nỗi đau gốc của bạn, điểm độc nhất - khác hubble.md passive.)
3. **Meet you where you are** - "ở đúng nơi bạn đã làm việc". (Slack + Telegram + desktop + browser, cùng workspace.)
4. **AI-first conversation** - "nói chuyện với công việc của bạn". (Chat AI đọc/ghi workspace; debt tracking là minh chứng, không phải app tài chính riêng.)

**Debt tracking nằm ở trụ 4** - nó là minh chứng cho "nói chuyện với công việc trên dữ liệu local", KHÔNG phải sản phẩm tài chính.

---

## 10. Product Principles (giá trị + trade-off)

> Khác với "không nên làm" ở dưới, đây là **nguyên tắc sống còn** giúp đưa quyết định khi gặp trade-off khó. Cagan: principles "phản ánh giá trị của tổ chức và các quyết định chiến lược giúp team chọn đúng khi gặp khó".

1. **Dữ liệu của user luôn là nơi user sở hữu, trước hết.** Mọi thứ quan trọng (notes, daily report, transcript, debt) phải là file Markdown trong workspace user - kể cả khi AI inference chạy trên cloud. (Nếu AI là cloud thì storage vẫn local; điều này giữ lời hứa "file-over-app".)
2. **Báo cáo phải trung thực, không cần đầy đủ.** Khi dữ liệu mỏng, báo cáo nói thật "hôm nay chưa có ghi chú" thay vì bịa ra. Một báo cáo chính xác nhỏ còn hơn một báo cáo phóng đại.
3. **Không mở rộng chức năng ngoài trục reporting.** Một tính năng chỉ được thêm nếu nó giúp công việc tự báo cáo lại cho bạn, ở nơi bạn làm việc, trên dữ liệu bạn sở hữu. Nếu không, tạm dừng.
4. **Quyền riêng tư là điểm bán hàng, không phải tính năng phụ.** Nếu một quyết định làm yếu đi lời hứa local-first/local-model mà không có lợi ích tương xứng, ưu tiên bảo vệ privacy.
5. **Chủ động hơn thụ động.** Ưu tiên "hệ thống tự đẩy thông tin đúng lúc" hơn "user phải mở app và tìm". (Khác biệt với hubble.md.)

### Những điều KHÔNG nên làm (chống trôi vision)
- **Đừng trở thành "Notion mới" / "second brain đầy đủ"** - thị trường đông đúc, hubble.md/Obsidian/Notion đã làm. Vision là **reporting**, không phải note-taking đầy đủ.
- **Đừng đẩy debt thành app tài chính riêng** - sẽ rơi vào Cleo/Monarch. Giữ debt như minh chứng "nói chuyện với dữ liệu local".
- **Đừng thêm feature chỉ để "đầy đủ"** - mọi feature phải trả lời: nó có giúp công việc tự báo cáo lại cho bạn, ở nơi bạn làm việc, trên dữ liệu bạn sở hữu không?

---

## 11. Roadmap (outcome-based, theo metric)

> Mỗi ưu tiên gắn **outcome + metric để biết thành công** (Pichler: roadmap là outcome-based, không phải feature list). Kèm thời frame và nguồn lực.

### Ưu tiên 1 - Làm daily summary ĐÁNG TIN (trụ 2, quan trọng nhất)
- **Outcome:** user tin tưởng báo cáo là sự thật, không bịa.
- **Hành động:** thêm grounding/verify; phân cấp quan trọng; fallback khi dữ liệu mỏng.
- **Metric thành công:** tỷ lệ báo cáo có ít nhất 1 mục "có nguồn/đúng" do user xác nhận không phóng đại; % báo cáo không cần user sửa. => Mục tiêu 6 tuần.

### Ưu tiên 2 - Giải quyết mâu thuẫn local-first vs cloud AI + "lethal trifecta"
- **Outcome:** user privacy-sensitive tin tưởng, không rời đi.
- **Hành động:** ghi rõ dữ liệu nào đi ra ngoài; cân nhắc local model (Ollama/LM Studio); giới hạn tool permission/outbound.
- **Metric thành công:** tỷ lệ user chọn "local model" hoặc bật chế độ giới hạn outbound; không có report vượt scope. => Mục tiêu 8-12 tuần. *(Với nhánh B đã chọn, local model là ưu tiên cao hơn để hạ chi phí hosting AI.)*

### Ưu tiên 3 - Trí nhớ hội thoại bền
- **Outcome:** user không mất ngữ cảnh hội thoại sau restart.
- **Hành động:** lưu transcript xuống workspace markdown (khớp triết lý local-first).
- **Metric thành công:** 100% hội thoại khôi phục được sau restart; transcript là file đọc được. => Mục tiêu 4-6 tuần.

### Ưu tiên 4 - Chọn một câu chuyện chính
- **Outcome:** positioning rõ ràng, không bị kẹp giữa "note app" và "finance".
- **Hành động:** lấy "daily work companion (local-first)" làm trục; debt/AI chat là bổ trợ; nếu giữ debt mạnh, mở rộng group/settlement.
- **Metric thành công:** không có đối thoại mơ hồ giữa các trục; content/landing nói một câu chuyện. => Liên tục.

### Ưu tiên 5 - Thêm tín hiệu PMF có thể đo
- **Outcome:** đo được retention và intent (không chỉ số cài đặt).
- **Hành động:** theo dõi retention hằng ngày; định nghĩa magic moment (mở daily report đúng giờ + chat); thêm pricing nhẹ.
- **Metric thành công:** WAU theo north-star tăng; có dữ liệu willingness-to-pay. => Mục tiêu 12 tuần.

### Ưu tiên 6 - Tận dụng làn sóng Notion
- **Outcome:** thu hút đúng người đang tìm chỗ rời Notion.
- **Hành động:** content "Work Boost vs Notion", "Tại sao nên rời Notion (offline, AI agent, privacy)".
- **Metric thành công:** traffic + conversion từ content (install/request). => Khi đã có sản phẩm ổn định.

---

## 12. Rủi ro & câu hỏi mở

- **Rủi ro lớn nhất:** mâu thuẫn local-first vs cloud AI. Nếu không giải quyết, mất chính phân khúc đang dựa vào.
- **Rủi ro:** TAM lớn nhưng SOM nhỏ - đừng dùng số thị trường hàng tỷ USD để biện minh.
- **Câu hỏi mở:** Người dùng có thực sự quay lại hằng ngày không? Debt tracking có cần cùng workspace với note không? Có cần local model không? *(Business Goals đã chốt nhánh B - thu phí nhẹ.)*
- **Cạnh tranh trực tiếp đáng lo nhất:** Obsidian (triết lý giống, hệ sinh thái plugin lớn) và OpenClaw (đa kênh, proactive).

---

## 13. Tóm tắt một câu

**Work Boost = "công việc của tôi tự báo cáo lại cho tôi mỗi ngày, ở đúng nơi tôi làm việc (Slack/Telegram), trên dữ liệu Markdown tôi làm chủ" - khác với hubble.md (notepad thụ động) và các bot reactive nhờ trí nhớ bền + báo cáo đáng tin + chủ động đẩy.**

**Chiến lược (một câu):** Ta chọn trục **"daily work companion (local-first, proactive reporting)"** - từ chối "Notion mới" (note-taking), "app finance" (debt), và "chatbot đa năng". Ba việc làm trước: (1) báo cáo đáng tin, (2) giải quyết mâu thuẫn cloud-AI/local-first, (3) trí nhớ hội thoại bền.

**Business Goals đã chốt:** nhánh B - thu phí nhẹ (thêm pricing nhẹ để đo intent, ưu tiên local model để hạ chi phí AI).

---

### Phương pháp & nguồn
- **Thị trường:** The Business Research Company, Technavio (2026); chạm AISO Tools, ToolChase, Vellum, METR.
- **User validation (quote trực tiếp):** Hacker News Algolia API (query "Notion offline", "local-first privacy", "AI notes summary", "Splitwise friends split") - comment-level; GitHub API (search/issues "daily summary"). Quote giữ nguyên từ HN. Vượt chặn bằng `warp-cli connect`.
- **Phân tích code:** `extensions/scheduler/daily-job.ts`, `packages/brain/src/sessions.ts`, `packages/data-provider/src/database.ts`, `packages/brain/src/tools/debt.ts`.
- **Nguồn gốc:** hubble.md README + CONTEXT.md; câu chuyện gốc của user (bot Slack cho báo cáo mỗi sáng).
- **Khung strategy:** Marty Cagan (SVPG) - vision vs strategy, 4-step, principles, empowered teams; Roman Pichler - 4 strategic choices, hierarchy vision/strategy/roadmap/backlog, outcome-based roadmap; Mind the Product (Ian David, Nacho Bassino) - diagnosis/insight/strategy drivers, one-pager, co-creation.
- **Bias cần lưu ý:** SplitPilot (đối thủ Splitwise), Vellum/ClawTank/Finny (tự quảng cáo sản phẩm của họ). Reddit/X chưa scrape trực tiếp (chặn bot). Framework từ Cagan/Pichler là trung lập; template từ userpilot/prodpad/clickup mang bias vendor.
