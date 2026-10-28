import {render, fireEvent, waitFor} from '@testing-library/react';
import {describe, it, expect, vi} from 'vitest';
import App from '../App';
import {api} from '../api/client';
import fixtureJSON from '../test/fixtures.json';
import type {IncidentRow, Overview, Page} from '../types/domain';

const fixture = fixtureJSON as unknown as {
  analysisId: string;
  overview: Overview;
  rows: Page<IncidentRow>;
};

describe('PR review: advertised list shortcuts at responsive widths', () => {
  for (const width of [1440, 1024, 390]) {
    it(`j focuses the first incident at ${width}px`, async () => {
      vi.spyOn(window, 'matchMedia').mockImplementation(query => {
        const maxWidth = /max-width:\s*(\d+)px/.exec(query);
        return {
          matches: maxWidth ? width <= Number(maxWidth[1]) : false,
          media: query, onchange: null,
          addEventListener() {}, removeEventListener() {},
          addListener() {}, removeListener() {}, dispatchEvent() {return false;},
        } as MediaQueryList;
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('review test: no network')));
      vi.spyOn(api, 'stageCatalog').mockResolvedValue({items:[],default_analysis_id:null});
      vi.spyOn(api, 'overview').mockResolvedValue(fixture.overview);
      vi.spyOn(api, 'incidents').mockResolvedValue({...fixture.rows,total:2,items:[fixture.rows.items[0],{...fixture.rows.items[0],incident:{...fixture.rows.items[0].incident,incident_id:'second-incident'}}]});
      history.replaceState({}, '', `/?analysis_id=${fixture.analysisId}`);
      const {container} = render(<App/>);
      const selector = width > 1280 ? '#incident-list tbody tr' : '#incident-list .mobile-row';
      await waitFor(() => expect(container.querySelector(selector)).not.toBeNull());
      (document.activeElement as HTMLElement)?.blur();
      fireEvent.keyDown(document, {key: 'j'});
      expect(document.activeElement).toBe(container.querySelector(selector));
      fireEvent.keyDown(document,{key:'j'});
      expect(document.activeElement).toBe(container.querySelectorAll(selector)[1]);
      fireEvent.keyDown(document,{key:'k'});
      expect(document.activeElement).toBe(container.querySelector(selector));
      const search=container.querySelector<HTMLInputElement>('input');
      search?.focus();
      fireEvent.keyDown(search!, {key:'j'});
      expect(document.activeElement).toBe(search);
    });
  }
});
