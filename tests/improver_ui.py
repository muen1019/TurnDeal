"""Actual pointer selection -> clarification -> next round using the integrated API."""
import json
import re
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

origin, output, mode = sys.argv[1:]
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width":1280,"height":900})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    response=page.request.post(origin+'/api/requests',headers={'Idempotency-Key':'ui-improver'},data={
        'intent_md':'買無線靜音滑鼠，預算1000元含稅運，7天內到貨。','preference_md':''})
    assert response.status==202,response.text()
    parent=response.json()['request_id']
    def snapshot(rid):
        return page.request.get(origin+'/api/requests/'+rid).json()
    def ready(rid):
        for _ in range(1200 if mode == 'live' else 150):
            result=snapshot(rid)
            if result['status']=='awaiting_user':return result
            if result['status'] in ['failed','no_match','needs_clarification']:raise AssertionError(result)
            time.sleep(.1)
        raise AssertionError('request timeout')
    original=ready(parent)
    page.goto(origin+'/requests/'+parent)
    page.wait_for_load_state('networkidle')
    for i in range(len(original['ranked_offers'])):
        expect(page.get_by_text(f"方案 {i+1} / {len(original['ranked_offers'])}",exact=True)).to_be_visible()
        expect(page.get_by_role('button',name='略過',exact=True)).to_be_enabled()
        box=page.get_by_test_id('offer-card-shell').bounding_box()
        x,y=box['x']+box['width']/2,box['y']+box['height']/2
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x-box['width']*.4,y,steps=12);page.mouse.up()
    field=page.get_by_label('完整說明這次想調整的條件',exact=True)
    expect(field).to_be_visible()
    before=page.request.get(origin+f'/api/requests/{parent}/improvement').json()
    assert before['next_request_id'] is None
    assert before['result']['preference_updated'] is False
    field.fill('這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。')
    page.get_by_role('button',name='更新需求並重新篩選',exact=True).click()
    next_round=page.get_by_role('button',name='查看新一輪結果',exact=True)
    expect(next_round).to_be_visible(timeout=70000)
    final=page.request.get(origin+f'/api/requests/{parent}/improvement').json()
    assert final['status']=='ready' and final['result']['preference_updated']
    assert final['improvement_id']!=before['improvement_id']
    child=final['next_request_id'];assert child
    assert snapshot(parent)['documents']==original['documents']
    page.get_by_role('region',name='需求改善').screenshot(path=str(Path(output,'ready.png')))
    page.reload();page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button',name='查看新一輪結果',exact=True)).to_be_enabled()
    page.get_by_role('button',name='查看新一輪結果',exact=True).click()
    page.wait_for_load_state('networkidle')
    child_snapshot=ready(child)
    if '/chat' in page.url:
        offers=page.get_by_role('button',name=re.compile(r'^查看\s+\d+\s+組優惠$'))
        expect(offers).to_be_visible(timeout=90000 if mode == 'live' else 15000)
        offers.click()
        page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button',name='立即採用',exact=True)).to_be_enabled(timeout=90000 if mode == 'live' else 15000)
    assert child_snapshot['parent_request_id']==parent and child_snapshot['root_request_id']==parent
    assert child_snapshot['documents']==final['result']['documents']
    assert child_snapshot['documents']['revision']==2 and child_snapshot['intent']['max_total_twd']==800
    assert any(p.get('attribute')=='size_class' and p.get('values')==['small'] for p in child_snapshot['intent']['product_preferences'])
    page.screenshot(path=str(Path(output,'child.png')),full_page=True)
    page.set_viewport_size({'width':375,'height':844})
    page.goto(origin+'/requests/'+parent);page.wait_for_load_state('networkidle')
    page.get_by_role('region',name='需求改善').screenshot(path=str(Path(output,'ready-mobile.png')))
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert errors==[],errors
    evidence={'result':'passed','parent_request_id':parent,'improvement_id':final['improvement_id'],'child_request_id':child,'checks':['pointer left swipes','draft without inferred preference','clarification submission','explicit preference saved','one child link survives reload','full child pipeline with frozen revision','mobile overflow'],'console_errors':errors}
    Path(output,'result.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(evidence,ensure_ascii=False))
    browser.close()
