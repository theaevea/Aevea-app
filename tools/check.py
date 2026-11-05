import json,re,struct,sys
P=json.load(open('/home/claude/aevea-app/docs/protocol.json'))
md=open('/home/claude/aevea-app/docs/device-protocol.md').read()
TS={k:v['size'] for k,v in P['types'].items() if k!='bytes'}
FMT={'u8':'<B','u16':'<H','u32':'<I','u64':'<Q','i8':'<b','i16':'<h','i32':'<i'}
def dec(fields,b):
    o=0;out={}
    for f in fields:
        if f['type'] in FMT:
            out[f['name']]=struct.unpack_from(FMT[f['type']],b,o)[0];o+=f['size']
        else:
            n=f['size'] if f['size']!='var' else (out[f['length_field']] if 'length_field' in f else len(b)-o)
            out[f['name']]=b[o:o+n];o+=n
        for k in ('enum',):
            if k in f and f['type'] in FMT:
                keys={int(x,16) for x in P['enums'][f[k]]}
                assert out[f['name']] in keys,(f['name'],out[f['name']])
        if 'range' in f and f['type'] in FMT:
            lo,hi=f['range'];v=out[f['name']];assert lo<=v<=hi or v in (0xFF,0xFFFF,127),(f['name'],out[f['name']])
    assert o==len(b),(o,len(b),[f['name'] for f in fields]);return out
H=lambda s:bytes.fromhex(s.replace(' ',''))
fr=P['frames'];n=0
def fields_of(x):
    if isinstance(x,list) and x and isinstance(x[0],str):
        nm=x[-1].split(':')[1].split(' ')[0] if 'magclip' in x[-1] and False else x[0].split(':')[1].split(' ')[0]
        return P['structs'][nm]['fields']
    return x
for c in P['commands']:
    rq=H(c['example']['request_hex']);rs=H(c['example']['response_hex'])
    h=dec(fr['command']['header'],rq[:5]);assert h['len']==len(rq)-5 and int(c['opcode'],16)==h['opcode']
    dec(c['request'],rq[5:])
    r=dec(fr['response']['header'],rs[:6]);assert r['len']==len(rs)-6 and r['seq']==h['seq'] and r['opcode']==h['opcode']
    dec(fields_of(c['response']),rs[6:]) if c['response'] else None
    assert len(rq)<=P['connection']['min_att_mtu']-3
    for k in ('request_hex','response_hex'): assert c['example'][k] in md,(c['name'],k)
    n+=1
gs=[c for c in P['commands'] if c['name']=='GET_STATUS'][0]['example']
dec(P['structs']['magclip_status']['fields'],H(gs['magclip_response_hex'])[6:])
for e in P['events']:
    b=H(e['example_hex']);h=dec(fr['event']['header'],b[:10]);assert h['len']==len(b)-10 and int(e['code'],16)==h['code']
    dec(e['fields'],b[10:]);assert e['example_hex'] in md,e['name'];n+=1
for k,s in P['structs'].items(): dec(s['fields'],H(s['example_hex']));assert s['example_hex'] in md;n+=1
for d in P['dfu']['ops']:
    dec(d['request'],H(d['example']['request_hex'])[1:]);dec(d['response'],H(d['example']['indication_hex'])[2:]);n+=1
dec(fr['dfu_data']['fields'],H(P['dfu']['data_example_hex']))
tok=dec(P['structs']['owner_token']['fields'],H([c for c in P['commands'] if c['name']=='OWNER_BIND'][0]['example']['request_hex'])[5:])
assert tok['purpose']==1
# uuids
uu=[ch['uuid'] for s in P['services'] for ch in s['characteristics']]+[s['uuid'] for s in P['services']]
assert len(uu)==len(set(uu))
for u in uu: assert re.fullmatch(r'[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}',u) and u in md
assert len(H(P['advertising']['manufacturer_data_example_hex']))+3+18+2<=31
# assumption refs in md exist
ids={a['id'] for a in P['assumptions']}
refs=set(re.findall(r'\[(A\d+)\]',md));assert refs<=ids,refs-ids;print('unreferenced',ids-refs)
print('OK',n,'messages/structs validated')
