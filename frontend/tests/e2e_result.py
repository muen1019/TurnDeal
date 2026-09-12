import json
import math
import os
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import expect, sync_playwright


BASE = os.environ.get("OFFERMESH_E2E_URL", "http://127.0.0.1:5187").rstrip("/")
ARTIFACTS = Path("test-results")
ARTIFACTS.mkdir(parents=True, exist_ok=True)

REQUEST_TEXT = (
    "Wireless silent mouse under TWD 1000, delivery within 7 days. "
    "Prefer black, small, and symmetrical. Free related accessories are okay."
)
FEEDBACK_TEXT = "Please keep the mouse under NT$850 and prefer the fastest delivery option."
SUPPORTED_INTENT = (
    "\u8fa6\u516c\u7528\u7121\u7dda\u6ed1\u9f20\uff0c"
    "\u9810\u7b97 900 \u5143\u542b\u7a05\u904b\uff0c"
    "7 \u5929\u5167\u5230\u8ca8\u3002"
)
SUPPORTED_PREFERENCE = (
    "\u50f9\u683c\u512a\u5148\uff0c"
    "\u53ef\u63a5\u53d7\u514d\u8cbb\u6ed1\u9f20\u588a\uff0c"
    "\u4e0d\u63a5\u53d7\u4ed8\u8cbb\u52a0\u8cfc\u3002"
)
VIEWPORT_DESKTOP = {"width": 1536, "height": 1024}
RESPONSIVE_WIDTHS = [320, 390, 768, 1440]
SHORT_HEIGHT_VIEWPORT = {"width": 1536, "height": 668}


def write_json(name, data):
    (ARTIFACTS / name).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def seed_workspace(page):
    page.add_init_script(
        """
        (() => {
          const workspace = {
            definitions: {
              intent: '# Buying intent\\nFind a wireless mouse suitable for daily office work.',
              preference: '# Preferences and limits\\n- Prefer comfort and price\\n- Accept a free mouse pad only when free\\n- Do not accept paid add-ons',
              savedIntent: '# Buying intent\\nFind a wireless mouse suitable for daily office work.',
              savedPreference: '# Preferences and limits\\n- Prefer comfort and price\\n- Accept a free mouse pad only when free\\n- Do not accept paid add-ons',
              version: 1
            },
            conversations: [{
              id: 'e2e-conversation',
              title: 'E2E shopping request',
              requestId: null,
              message: '',
              definitionVersion: 1,
              draft: '',
              feedback: '',
              feedbackHistory: [],
              skipped: [],
              snapshot: null
            }],
            activeId: 'e2e-conversation'
          };
          sessionStorage.clear();
          sessionStorage.setItem('offermesh:demo-buyer:workspace:v1', JSON.stringify(workspace));
        })();
        """
    )


def api_get(page, path):
    response = page.request.get(BASE + path)
    assert response.ok, f"GET {path} failed: {response.status} {response.text()}"
    return response.json()


def wait_for_snapshot(page, request_id, status="awaiting_user", timeout_ms=12000):
    deadline = time.time() + timeout_ms / 1000
    last = None
    while time.time() < deadline:
        last = api_get(page, f"/api/requests/{request_id}")
        if status is None or last.get("status") == status:
            return last
        time.sleep(0.2)
    raise AssertionError(f"request {request_id} did not reach {status}; last={last}")


def create_request_via_proxy(page, label, api_posts):
    body = {
        "intent_md": SUPPORTED_INTENT,
        "preference_md": SUPPORTED_PREFERENCE,
    }
    response = page.request.post(
        BASE + "/api/requests",
        data=body,
        headers={"Idempotency-Key": f"e2e-{label}-{time.time_ns()}"},
    )
    api_posts.append({"url": BASE + "/api/requests", "body": body, "status": response.status})
    assert response.status in (200, 202), (
        f"create request status {response.status}: {response.text()}"
    )
    request_id = response.json()["request_id"]
    snapshot = wait_for_snapshot(page, request_id)
    assert snapshot["status"] == "awaiting_user"
    assert len(snapshot["seller_agents"]) == 3
    assert len(snapshot["ranked_offers"]) >= 3
    return request_id, snapshot


def create_request_from_chat(page, label, api_posts):
    page.goto(BASE + "/chat")
    page.wait_for_load_state("networkidle")
    expect(page.locator(".chat-panel")).to_be_visible()
    composer = page.locator("#buyer-requirement")
    expect(composer).to_be_visible()
    composer.fill(REQUEST_TEXT)
    expect(page.locator(".chat-send-button")).to_be_enabled()
    return create_request_via_proxy(page, label, api_posts)


def stable_box(page, selector):
    box = page.locator(selector).bounding_box()
    assert box, f"missing box for {selector}"
    return {key: round(box[key], 2) for key in ("x", "y", "width", "height")}


def assert_same_box(a, b, label, tolerance=1.5):
    for key in ("x", "y", "width", "height"):
        assert abs(a[key] - b[key]) <= tolerance, f"{label} {key}: {a[key]} != {b[key]}"


def assert_no_overflow(page, label):
    metrics = page.evaluate(
        """
        () => {
          const root = document.documentElement;
          const body = document.body;
          const box = (el) => el ? el.getBoundingClientRect().toJSON() : null;
          return {
            innerWidth,
            innerHeight,
            documentScrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
            documentScrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
            bodyClientWidth: body.clientWidth,
            shell: box(document.querySelector('.chat-app-shell')),
            main: box(document.querySelector('.chat-main-slot')),
            workspace: box(document.querySelector('.workspace-content, .chat-thread')),
            shellBackground: getComputedStyle(document.querySelector('.chat-app-shell') || body).backgroundColor,
            bodyBackground: getComputedStyle(body).backgroundColor,
            overflowing: Array.from(document.body.querySelectorAll('*')).filter((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
            }).slice(0, 12).map((el) => ({
              tag: el.tagName,
              className: String(el.className),
              text: (el.textContent || '').trim().slice(0, 80),
              rect: el.getBoundingClientRect().toJSON()
            }))
          };
        }
        """
    )
    assert metrics["documentScrollWidth"] <= metrics["innerWidth"] + 1, (
        f"{label} page overflow: {metrics}"
    )
    assert metrics["documentScrollHeight"] <= metrics["innerHeight"] + 1, (
        f"{label} document vertical overflow: {metrics}"
    )
    shell = metrics["shell"]
    assert shell, f"{label} missing app shell"
    assert abs(shell["x"]) <= 1 and abs(shell["y"]) <= 1, f"{label} shell is not full bleed: {shell}"
    assert abs(shell["width"] - metrics["innerWidth"]) <= 1, f"{label} shell width is not full bleed: {metrics}"
    assert abs(shell["height"] - metrics["innerHeight"]) <= 1, f"{label} shell height is not full bleed: {metrics}"
    assert metrics["shellBackground"] in ("rgb(232, 241, 248)", "rgba(232, 241, 248, 1)"), (
        f"{label} shell should be pale blue: {metrics}"
    )
    assert metrics["bodyBackground"] != "rgb(242, 238, 230)", f"{label} body still uses beige frame: {metrics}"
    assert not metrics["overflowing"], f"{label} element overflow: {metrics['overflowing']}"
    return metrics


def assert_no_visible_technical_ui(page, label):
    visible_text = page.evaluate("document.body.innerText")
    forbidden = [
        "API response",
        "API Response",
        "api_response",
        "source_documents",
        "request_id",
        "offer_id",
        "campaign_id",
        "terms_id",
        "決策資料",
    ]
    found = [token for token in forbidden if token in visible_text]
    assert not found, f"{label} exposes technical UI tokens: {found}"


def assert_same_bounds_for_viewports(page, request_id, first_offer_id, viewports):
    result = {}
    for name, viewport in viewports:
        page.set_viewport_size(viewport)
        page.goto(BASE + "/chat")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".chat-panel")).to_be_visible()
        assert_no_visible_technical_ui(page, f"{name}-chat")
        chat_shell = stable_box(page, ".chat-app-shell")
        chat_main = stable_box(page, ".chat-main-slot")
        result[f"{name}-chat"] = assert_no_overflow(page, f"{name}-chat")

        page.goto(f"{BASE}/requests/{request_id}")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".offer-deck")).to_be_visible()
        assert_no_visible_technical_ui(page, f"{name}-offers")
        assert_same_box(chat_shell, stable_box(page, ".chat-app-shell"), f"{name} chat/offers shell")
        assert_same_box(chat_main, stable_box(page, ".chat-main-slot"), f"{name} chat/offers main")
        result[f"{name}-offers"] = assert_no_overflow(page, f"{name}-offers")

        page.goto(f"{BASE}/requests/{request_id}?view=details&offer_id={first_offer_id}")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".offer-details")).to_be_visible()
        assert_no_visible_technical_ui(page, f"{name}-details")
        assert_same_box(chat_shell, stable_box(page, ".chat-app-shell"), f"{name} chat/details shell")
        assert_same_box(chat_main, stable_box(page, ".chat-main-slot"), f"{name} chat/details main")
        result[f"{name}-details"] = assert_no_overflow(page, f"{name}-details")
    return result


def drag_card(page, dx, dy=0, steps=8, release=True):
    card = page.locator('[data-testid="offer-card-shell"]').first
    expect(card).to_be_visible()
    box = card.bounding_box()
    assert box, "card has no bounding box"
    heading_box = page.locator(".offer-card h3").first.bounding_box()
    origin = heading_box or box
    x = origin["x"] + min(16, origin["width"] / 2)
    y = origin["y"] + origin["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=steps)
    if release:
        page.mouse.up()
    return box


def wait_for_skipped(page, expected):
    page.wait_for_function(
        """
        expected => {
          const raw = sessionStorage.getItem('offermesh:demo-buyer:workspace:v1');
          if (!raw) return false;
          const workspace = JSON.parse(raw);
          const active = workspace.conversations.find((item) => item.id === workspace.activeId);
          return JSON.stringify(active?.skipped ?? []) === JSON.stringify(expected);
        }
        """,
        arg=expected,
        timeout=5000,
    )


def offer_by_id(snapshot, offer_id):
    return next(offer for offer in snapshot["offers"] if offer["offer_id"] == offer_id)


def assert_details_items(page, offer):
    rows = page.locator(".offer-details .offer-item-row")
    expect(rows).to_have_count(len(offer["items"]))
    rendered_rows = rows.all_inner_texts()
    rendered = "\n".join(rendered_rows)
    for index, item in enumerate(offer["items"]):
        assert rendered_rows[index].strip(), f"item row {index + 1} is empty"
        assert str(item["quantity"]) in rendered_rows[index], (
            f"missing quantity {item['quantity']} in item row {index + 1}"
        )
        assert item["product_id"] not in rendered, (
            f"details expose technical product id {item['product_id']}"
        )


def click_skip_button(page):
    page.locator(".offer-deck__actions .offer-button--secondary").first.click()


def click_undo_button(page):
    page.locator(".offer-deck__actions .offer-button--quiet").first.click()


def submit_feedback(page, text):
    form = page.locator(".feedback-form")
    expect(form).to_be_visible()
    form.locator("textarea").fill(text)
    form.locator(".offer-button--primary").first.click()


def run_primary_flow(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport=VIEWPORT_DESKTOP,
        reduced_motion="no-preference",
    )
    page = context.new_page()
    errors = []
    posts = []
    api_posts = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on(
        "request",
        lambda request: posts.append({"url": request.url, "body": request.post_data_json})
        if request.method == "POST" and "/api/" in request.url
        else None,
    )
    seed_workspace(page)

    request_id, snapshot = create_request_from_chat(page, "accept", api_posts)
    chat_shell = stable_box(page, ".chat-app-shell")
    chat_main = stable_box(page, ".chat-main-slot")
    assert_no_overflow(page, "chat-1536")
    assert_no_visible_technical_ui(page, "chat-1536")
    page.screenshot(path=str(ARTIFACTS / "chat-1536.png"), full_page=True)

    page.goto(f"{BASE}/requests/{request_id}")
    page.wait_for_load_state("networkidle")
    expect(page.locator(".offer-deck")).to_be_visible()
    offers_shell = stable_box(page, ".chat-app-shell")
    offers_main = stable_box(page, ".chat-main-slot")
    assert_same_box(chat_shell, offers_shell, "chat/offers shell")
    assert_same_box(chat_main, offers_main, "chat/offers main")
    assert_no_overflow(page, "offers-1536")
    assert_no_visible_technical_ui(page, "offers-1536")
    page.screenshot(path=str(ARTIFACTS / "offers-1536.png"), full_page=True)

    first_offer_id = snapshot["ranked_offers"][0]["offer_id"]
    first_offer = offer_by_id(snapshot, first_offer_id)
    page.locator(".offer-card__details").first.click()
    page.wait_for_url(
        lambda url: "view=details" in url and first_offer_id in unquote(str(url)),
        timeout=5000,
    )
    expect(page.locator(".offer-details")).to_be_visible()
    details_shell = stable_box(page, ".chat-app-shell")
    details_main = stable_box(page, ".chat-main-slot")
    assert_same_box(chat_shell, details_shell, "chat/details shell")
    assert_same_box(chat_main, details_main, "chat/details main")
    assert_details_items(page, first_offer)
    assert_no_overflow(page, "details-1536")
    assert_no_visible_technical_ui(page, "details-1536")
    page.screenshot(path=str(ARTIFACTS / "details-1536.png"), full_page=True)

    responsive_metrics = {}
    for width in RESPONSIVE_WIDTHS:
        page.set_viewport_size({"width": width, "height": 1024})
        page.goto(f"{BASE}/requests/{request_id}")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".offer-deck")).to_be_visible()
        responsive_metrics[f"offers-{width}"] = assert_no_overflow(page, f"offers-{width}")
        assert_no_visible_technical_ui(page, f"offers-{width}")
        page.screenshot(path=str(ARTIFACTS / f"offers-{width}.png"), full_page=True)

        page.goto(f"{BASE}/requests/{request_id}?view=details&offer_id={first_offer_id}")
        page.wait_for_load_state("networkidle")
        expect(page.locator(".offer-details")).to_be_visible()
        assert_details_items(page, first_offer)
        responsive_metrics[f"details-{width}"] = assert_no_overflow(page, f"details-{width}")
        assert_no_visible_technical_ui(page, f"details-{width}")

    responsive_metrics.update(
        assert_same_bounds_for_viewports(
            page,
            request_id,
            first_offer_id,
            [("short-1536x668", SHORT_HEIGHT_VIEWPORT)],
        )
    )
    page.screenshot(path=str(ARTIFACTS / "short-1536x668-details.png"), full_page=True)

    page.set_viewport_size(VIEWPORT_DESKTOP)
    page.goto(f"{BASE}/requests/{request_id}")
    page.wait_for_load_state("networkidle")
    expect(page.locator(".offer-deck")).to_be_visible()
    card_box = page.locator('[data-testid="offer-card-shell"]').first.bounding_box()
    assert card_box, "card missing before drag"
    drag_card(page, -math.ceil(card_box["width"] * 0.32))
    wait_for_skipped(page, [first_offer_id])
    assert len([r for r in posts if r["body"] and r["body"].get("action") in ("accept", "reject")]) == 0
    click_undo_button(page)
    wait_for_skipped(page, [])
    page.screenshot(path=str(ARTIFACTS / "drag-left-undo.png"), full_page=True)

    card_box = page.locator('[data-testid="offer-card-shell"]').first.bounding_box()
    assert card_box, "card missing before adopt drag"
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith(f"/api/requests/{request_id}/decisions")
    ) as decision_response:
        drag_card(page, math.ceil(card_box["width"] * 0.32))
    accept_response = decision_response.value
    assert accept_response.status == 200, f"accept failed {accept_response.status}: {accept_response.text()}"
    accepted = wait_for_snapshot(page, request_id, "accepted")
    assert accepted["decision"]["action"] == "accept"
    assert accepted["selected_offer_id"] == first_offer_id
    assert len([r for r in posts if r["body"] and r["body"].get("action") == "accept"]) == 1
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.locator(".accepted-receipt")).to_be_visible()
    assert_no_visible_technical_ui(page, "accepted-reload")
    page.screenshot(path=str(ARTIFACTS / "accepted-reload.png"), full_page=True)

    page.locator(".chat-new-button").click()
    reject_id, before_reject = create_request_from_chat(page, "reject", api_posts)
    page.goto(f"{BASE}/requests/{reject_id}")
    page.wait_for_load_state("networkidle")
    pre_skip_posts = len(posts)
    for _ in before_reject["ranked_offers"]:
        click_skip_button(page)
    expect(page.locator(".feedback-form")).to_be_visible()
    assert len(posts) == pre_skip_posts, "local skips should not POST"
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith(f"/api/requests/{reject_id}/decisions")
    ) as reject_response:
        submit_feedback(page, FEEDBACK_TEXT)
    response = reject_response.value
    assert response.status == 200, f"reject failed {response.status}: {response.text()}"
    rejected = wait_for_snapshot(page, reject_id, "rejected")
    assert rejected["decision"]["action"] == "reject"
    assert rejected["decision"]["feedback"] == FEEDBACK_TEXT
    assert rejected["decision"]["source_documents"] == before_reject["documents"] == rejected["documents"]
    assert len([r for r in posts if r["body"] and r["body"].get("action") == "reject"]) == 1
    assert len([r for r in api_posts if urlparse(r["url"]).path == "/api/requests"]) == 2
    assert all("/redemptions" not in r["url"] for r in posts)
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.locator(".workspace-content")).to_contain_text(FEEDBACK_TEXT)
    assert_no_visible_technical_ui(page, "rejected-reload")
    page.screenshot(path=str(ARTIFACTS / "rejected-reload.png"), full_page=True)

    write_json(
        "e2e-result.json",
        {
            "passed": True,
            "base": BASE,
            "flows": [
                "chat-create",
                "offers-details",
                "drag-left-undo",
                "drag-right-accept-reload",
                "local-skips-reject-reload",
            ],
            "accepted_request_id": request_id,
            "rejected_request_id": reject_id,
            "responsive_metrics": responsive_metrics,
            "posts": posts,
            "api_posts": api_posts,
            "errors": errors,
        },
    )
    assert not errors, errors
    context.close()
    browser.close()


def run_reduced_motion_check(playwright):
    setup_browser = playwright.chromium.launch(headless=True)
    setup_context = setup_browser.new_context(viewport=VIEWPORT_DESKTOP)
    setup_page = setup_context.new_page()
    seed_workspace(setup_page)
    request_id, _snapshot = create_request_from_chat(setup_page, "reduced-motion", [])
    setup_context.close()
    setup_browser.close()

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport=VIEWPORT_DESKTOP, reduced_motion="reduce")
    page = context.new_page()
    posts = []
    page.on(
        "request",
        lambda request: posts.append(request.url)
        if request.method == "POST" and "/api/" in request.url
        else None,
    )
    page.goto(f"{BASE}/requests/{request_id}")
    page.wait_for_load_state("networkidle")
    expect(page.locator(".offer-deck")).to_be_visible()
    card_box = page.locator('[data-testid="offer-card-shell"]').first.bounding_box()
    assert card_box, "reduced-motion card missing"
    drag_card(page, math.ceil(card_box["width"] * 0.35), release=False)
    transform = page.locator('[data-testid="offer-card-shell"]').first.evaluate(
        "el => getComputedStyle(el).transform",
    )
    matrix_tx = page.locator('[data-testid="offer-card-shell"]').first.evaluate(
        """
        el => {
          const transform = getComputedStyle(el).transform;
          if (!transform || transform === 'none') return 0;
          const m = new DOMMatrixReadOnly(transform);
          return m.m41;
        }
        """,
    )
    assert abs(matrix_tx) < 0.5, (
        f"reduced motion should keep card centered, transform={transform} tx={matrix_tx}"
    )
    page.keyboard.press("Escape")
    page.mouse.up()
    page.screenshot(path=str(ARTIFACTS / "reduced-motion-drag.png"), full_page=True)
    assert_no_visible_technical_ui(page, "reduced-motion")
    assert not posts, f"reduced-motion inspection should not submit decisions: {posts}"
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run_primary_flow(playwright)
    run_reduced_motion_check(playwright)

print(
    "PASS: browser -> Vite /api proxy -> real backend -> SQLite; "
    "layout, details, gestures, reduced motion, accept/reject reload checks",
)
