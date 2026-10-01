import { formatTrace, note, span, traced, traceMeta, TraceResult, traceSinks } from '../../src/core/trace';

describe('Traces de Jev : étapes chronométrées et imbriquées', () => {
  let got: TraceResult[] = [];
  const sink = (t: TraceResult) => { got.push(t); };
  beforeAll(() => traceSinks.push(sink));
  afterAll(() => traceSinks.splice(traceSinks.indexOf(sink), 1));
  beforeEach(() => { got = []; });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('imbrication, durées, détails, repères, informations générales ; étapes parallèles rattachées au bon parent', async () => {
    const out = await traced('Essai', async () => {
      traceMeta('cas', '2');
      await span('A', async (d) => {
        await wait(20);
        d.x = 1;
        await Promise.all([span('A.1', () => wait(10)), span('A.2', () => wait(15))]);
        note('repère', { k: 'v' }, 5);
      });
      await span('B', () => wait(5));
      return 42;
    });
    expect(out).toBe(42);
    const t = got[0];
    expect(t).toMatchObject({ label: 'Essai', meta: { cas: '2' } });
    const by = (n: string) => t.spans.find((s) => s.name === n)!;
    expect(by('A')).toMatchObject({ depth: 0, parent: null, detail: { x: 1 } });
    expect(by('A.1')).toMatchObject({ depth: 1, parent: by('A').i });
    expect(by('A.2')).toMatchObject({ depth: 1, parent: by('A').i });
    expect(by('repère')).toMatchObject({ depth: 1, ms: 5, detail: { k: 'v' } });
    expect(by('B')).toMatchObject({ depth: 0 });
    expect(by('A').ms).toBeGreaterThanOrEqual(30);
    expect(t.totalMs).toBeGreaterThanOrEqual(by('A').ms);
    expect(formatTrace(t)).toMatch(/\[jev:trace\] tr-.* · Essai · \d+ ms · cas=2\n.* A — x: 1\n.* A\.1\n/);
  });

  it('erreur : notée sur l’étape et dans la trace, puis relancée ; hors trace, span exécute seulement', async () => {
    await expect(traced('Erreur', () => span('C', async () => { throw new Error('panne'); }))).rejects.toThrow('panne');
    expect(got[0].spans[0]).toMatchObject({ name: 'C', error: 'panne' });
    expect(got[0].meta.error).toBe('panne');
    expect(await span('libre', async () => 7)).toBe(7);
    expect(got).toHaveLength(1);
  });
});
