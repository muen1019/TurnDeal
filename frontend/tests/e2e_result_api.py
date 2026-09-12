"""Result contract integration against real HTTP and SQLite."""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
base=os.environ.get('OFFERMESH_E2E_URL','http://127.0.0.1:5188')
artifacts=Path('test-results');artifacts.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1536,'height':1024})
    errors=[];posts=[];api_requests=[]
    page.on('request',lambda r:api_requests.append({'method':r.method,'path':r.url.split(base)[-1]}) if '/api/' in r.url or '/__mock/' in r.url else None)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:posts.append({'url':r.url,'body':r.post_data_json}) if r.method=='POST' and '/api/' in r.url else None)
    page.goto(base+'/chat');page.wait_for_load_state('networkidle')
    def create():
        composer=page.get_by_placeholder(re.compile('輸入需求'))
        composer.fill('辦公用無線滑鼠，預算 900 元含稅運，7 天內到貨。')
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/requests')) as creation:
            composer.press('Enter')
        request_id=creation.value.json()['request_id']
        page.wait_for_function("id=>JSON.parse(sessionStorage.getItem('offermesh:demo-buyer:workspace:v1')).conversations.some(c=>c.requestId===id&&c.snapshot?.status!=='formatting')",arg=request_id)
        snapshot=page.request.get(base+'/api/requests/'+request_id).json()
        artifacts.joinpath('result-api-created.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding='utf-8')
        assert snapshot['status']=='awaiting_user',snapshot
        page.get_by_role('button',name=re.compile('查看.*組優惠')).click()
        expect(page.get_by_role('heading',name='為你找到的優惠')).to_be_visible()
        request_id=re.search(r'/requests/([^/?]+)',page.url).group(1)
        snapshot=page.request.get(base+'/api/requests/'+request_id).json()
        assert snapshot['status']=='awaiting_user' and len(snapshot['seller_agents'])==5
        return request_id,snapshot
    first_id,s=create()
    expect(page.get_by_role('button',name='立即採用',exact=True)).to_be_enabled()
    card=page.get_by_test_id('offer-card-shell');box=card.bounding_box();title=card.locator('h3').bounding_box()
    x=title['x']+title['width']*.2;y=title['y']+title['height']*.5
    page.mouse.move(x,y)
    page.mouse.down();page.mouse.move(x+box['width']*.35,y,steps=12);page.mouse.up()
    expect(page.get_by_text('決策已保存；尚未購買或付款。',exact=True)).to_be_visible()
    page.reload();page.wait_for_load_state('networkidle')
    expect(page.get_by_text('決策已保存；尚未購買或付款。',exact=True)).to_be_visible()
    saved=page.request.get(base+'/api/requests/'+first_id).json()
    assert saved['decision']['action']=='accept' and saved['selected_offer_id']==s['ranked_offers'][0]['offer_id']
    page.screenshot(path=str(artifacts/'result-api-accepted.png'),full_page=True)
    page.get_by_role('button',name='開始新的購物需求',exact=True).click()
    second_id,before=create();count=len(posts)
    for _ in before['ranked_offers']:
        skip=page.get_by_role('button',name='略過',exact=True)
        skip.focus();skip.press('Enter')
    expect(page.get_by_role('heading',name='補充需求',exact=True)).to_be_visible()
    assert len(posts)==count
    page.get_by_label('回饋內容').fill('  不喜歡，請不要滑鼠墊。  ')
    page.get_by_role('button',name='送出回饋',exact=True).click()
    expect(page.get_by_role('heading',name='回饋已保存',exact=True)).to_be_visible()
    page.reload();page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading',name='回饋已保存',exact=True)).to_be_visible()
    after=page.request.get(base+'/api/requests/'+second_id).json()
    assert after['status']=='rejected' and after['next_request_id'] is None
    assert after['decision']['source_documents']==before['documents']==after['documents']
    assert after['decision']['feedback']=='  不喜歡，請不要滑鼠墊。  '
    assert len([r for r in posts if r['body'].get('action')=='accept'])==1
    assert len([r for r in posts if r['body'].get('action')=='reject'])==1
    assert len([r for r in posts if r['url'].endswith('/api/requests')])==2
    assert all('/redemptions' not in r['url'] for r in posts)
    assert all(re.fullmatch(r'/api/requests(?:/[^/?]+(?:/decisions)?)?',r['path']) for r in api_requests),api_requests
    assert all((r['method']=='POST' and (r['path']=='/api/requests' or r['path'].endswith('/decisions'))) or (r['method']=='GET' and re.fullmatch(r'/api/requests/[^/?]+',r['path'])) for r in api_requests),api_requests
    page.screenshot(path=str(artifacts/'result-api-rejected.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    expect(page.get_by_role('heading',name='回饋已保存',exact=True)).to_be_visible()
    page.screenshot(path=str(artifacts/'result-api-mobile.png'),full_page=True)
    assert not errors,errors
    artifacts.joinpath('result-api-e2e.json').write_text(json.dumps({'passed':True,'flows':['chat-right-swipe-accept-reload','keyboard-skips-reject-reload'],'posts':posts,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
print('PASS: Result API browser integration, right swipe, keyboard skips, exact feedback and reload recovery')
