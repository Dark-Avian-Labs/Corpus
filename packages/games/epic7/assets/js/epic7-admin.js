import { escapeHtml, escapeAttr, debounce } from '@lib/utils';

const cfg = window.EPIC7_ADMIN_CONFIG || {};
const BASE_PATH = cfg.basePath || '';
const API_URL = `${BASE_PATH}/api`;
const ICONS_BASE = `${BASE_PATH}/assets/icons`;
const CSRF_TOKEN =
  document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
  '';
const CLASS_NAMES = cfg.classNames || {};
const ELEMENT_NAMES = cfg.elementNames || {};
const CLASS_WHITELIST = Object.keys(CLASS_NAMES);
const ELEMENT_WHITELIST = Object.keys(ELEMENT_NAMES);
let heroes = [],
  artifacts = [];
let currentTab = 'heroes';
let searchTerm = '';

function getHeroesTableBody() {
  return (
    document.getElementById('heroes-table') ||
    document.querySelector('#heroes-content .table-container tbody')
  );
}
function getArtifactsTableBody() {
  return (
    document.getElementById('artifacts-table') ||
    document.querySelector('#artifacts-content .table-container tbody')
  );
}

document.addEventListener('DOMContentLoaded', init);

function openHeroModal() {
  document.getElementById('hero-name').value = '';
  document.getElementById('hero-class').value = 'knight';
  document.getElementById('hero-element').value = 'fire';
  document.getElementById('hero-stars').value = '5';
  document.getElementById('hero-modal').classList.add('active');
  document.getElementById('hero-name').focus();
}
function openArtifactModal() {
  document.getElementById('artifact-name').value = '';
  document.getElementById('artifact-class').value = 'knight';
  document.getElementById('artifact-stars').value = '5';
  document.getElementById('artifact-modal').classList.add('active');
  document.getElementById('artifact-name').focus();
}

async function init() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  });
  const tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    tablist.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const current = tabs.indexOf(document.activeElement);
      if (current === -1) return;
      let next;
      if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (e.key === 'ArrowLeft')
        next = (current - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      selectTab(tabs[next].dataset.tab, true);
    });
  }
  const addBtn = document.getElementById('add-btn');
  if (addBtn)
    addBtn.addEventListener('click', () => {
      if (currentTab === 'heroes') openHeroModal();
      else openArtifactModal();
    });
  const heroCancel = document.getElementById('hero-cancel');
  const heroForm = document.getElementById('hero-form');
  const heroModal = document.getElementById('hero-modal');
  const artifactCancel = document.getElementById('artifact-cancel');
  const artifactForm = document.getElementById('artifact-form');
  const artifactModal = document.getElementById('artifact-modal');
  if (heroCancel)
    heroCancel.addEventListener('click', () => {
      if (heroModal) heroModal.classList.remove('active');
    });
  if (heroForm) heroForm.addEventListener('submit', handleAddHero);
  if (heroModal)
    heroModal.addEventListener('click', (e) => {
      if (e.target.id === 'hero-modal') heroModal.classList.remove('active');
    });
  if (artifactCancel)
    artifactCancel.addEventListener('click', () => {
      if (artifactModal) artifactModal.classList.remove('active');
    });
  if (artifactForm) artifactForm.addEventListener('submit', handleAddArtifact);
  if (artifactModal)
    artifactModal.addEventListener('click', (e) => {
      if (e.target.id === 'artifact-modal')
        artifactModal.classList.remove('active');
    });
  const searchInput = document.getElementById('search');
  const searchClear = document.getElementById('search-clear');
  if (searchInput) {
    const debouncedRender = debounce(() => {
      renderHeroes();
      renderArtifacts();
    }, 300);
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      searchClear?.classList.toggle('visible', e.target.value.length > 0);
      debouncedRender();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchTerm = '';
        searchClear.classList.remove('visible');
      }
      renderHeroes();
      renderArtifacts();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document
        .querySelectorAll('.modal-overlay.active')
        .forEach((m) => m.classList.remove('active'));
    }
  });
  try {
    await Promise.all([loadHeroes(), loadArtifacts()]);
  } catch (e) {
    console.error('Initial load failed', e);
  }
}

function selectTab(tab, focus = false) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((t) => {
    const isActive = t.dataset.tab === tab;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
    t.setAttribute('tabindex', isActive ? '0' : '-1');
    if (isActive && focus) t.focus();
  });
  document.querySelectorAll('.tab-content').forEach((c) => {
    c.classList.toggle('active', c.id === `${tab}-content`);
  });
}

async function loadHeroes() {
  const tbody = getHeroesTableBody();
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';
  try {
    const r = await fetch(`${API_URL}?action=admin_base_heroes`);
    if (!r.ok) {
      const text = await r.text();
      tbody.innerHTML = `<tr><td colspan="5" class="loading text-danger">${escapeHtml(`Error ${r.status} ${r.statusText}: ${text}`)}</td></tr>`;
      return;
    }
    const d = await r.json();
    if (d.error) {
      tbody.innerHTML = `<tr><td colspan="5" class="loading text-danger">${escapeHtml(d.error)}</td></tr>`;
      return;
    }
    heroes = d.heroes || [];
    renderHeroes();
  } catch {
    tbody.innerHTML =
      '<tr><td colspan="5" class="loading text-danger">Failed to load heroes</td></tr>';
  }
}

function renderHeroes() {
  const tbody = getHeroesTableBody();
  if (!tbody) return;
  const list = searchTerm
    ? heroes.filter((h) => (h.name || '').toLowerCase().includes(searchTerm))
    : heroes;
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading">${heroes.length === 0 ? 'No heroes found. Import or add some.' : 'No matches for search.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map((h) => {
      const safeClass = CLASS_WHITELIST.includes(h.class) ? h.class : 'unknown';
      const safeElement = ELEMENT_WHITELIST.includes(h.element)
        ? h.element
        : 'unknown';
      const classDisplay = escapeAttr(CLASS_NAMES[safeClass] || 'Unknown');
      const elementDisplay = escapeAttr(
        ELEMENT_NAMES[safeElement] || 'Unknown',
      );
      const parsedStar = parseInt(h.star_rating, 10);
      const starCount = Math.max(
        3,
        Math.min(5, Number.isFinite(parsedStar) ? parsedStar : 3),
      );
      const stars = Array(starCount)
        .fill(0)
        .map(
          () =>
            `<img src="${ICONS_BASE}/star${starCount}.png" alt="${escapeAttr(String(starCount))} stars">`,
        )
        .join('');
      return `<tr><td>${escapeHtml(h.name)}</td><td class="icon-cell"><img src="${ICONS_BASE}/${encodeURIComponent(safeClass)}.png" alt="${classDisplay}" title="${classDisplay}"></td><td class="icon-cell"><img src="${ICONS_BASE}/${encodeURIComponent(safeElement)}.png" alt="${elementDisplay}" title="${elementDisplay}"></td><td class="stars-cell">${stars}</td><td class="row-actions"><button class="btn btn-sm btn-danger" data-del-hero-id="${escapeAttr(h.id)}" data-del-hero-name="${escapeAttr(h.name)}">Delete</button></td></tr>`;
    })
    .join('');
  tbody
    .querySelectorAll('[data-del-hero-id]')
    .forEach((btn) =>
      btn.addEventListener('click', () =>
        deleteHero(parseInt(btn.dataset.delHeroId), btn.dataset.delHeroName),
      ),
    );
}

async function handleAddHero(e) {
  e.preventDefault();
  const name = document.getElementById('hero-name').value.trim();
  const heroClass = document.getElementById('hero-class').value;
  const element = document.getElementById('hero-element').value;
  const stars = parseInt(document.getElementById('hero-stars').value);
  try {
    const r = await fetch(`${API_URL}?action=admin_add_base_hero`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({
        name,
        class: heroClass,
        element,
        star_rating: stars,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error: ${r.status} ${r.statusText}${text ? `: ${text}` : ''}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    document.getElementById('hero-modal').classList.remove('active');
    await loadHeroes();
  } catch (err) {
    alert(`Failed to add hero: ${err.message}`);
  }
}

async function deleteHero(heroId, heroName) {
  if (
    !confirm(
      `Delete hero "${heroName}"? This will also remove it from all user accounts.`,
    )
  )
    return;
  try {
    const r = await fetch(`${API_URL}?action=admin_delete_base_hero`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ hero_id: heroId }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error ${r.status} ${r.statusText}: ${text}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    await loadHeroes();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}

async function loadArtifacts() {
  const tbody = getArtifactsTableBody();
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading...</td></tr>';
  try {
    const r = await fetch(`${API_URL}?action=admin_base_artifacts`);
    if (!r.ok) {
      const text = await r.text();
      tbody.innerHTML = `<tr><td colspan="4" class="loading text-danger">${escapeHtml(`Error ${r.status} ${r.statusText}: ${text}`)}</td></tr>`;
      return;
    }
    const d = await r.json();
    if (d.error) {
      tbody.innerHTML = `<tr><td colspan="4" class="loading text-danger">${escapeHtml(d.error)}</td></tr>`;
      return;
    }
    artifacts = d.artifacts || [];
    renderArtifacts();
  } catch {
    tbody.innerHTML =
      '<tr><td colspan="4" class="loading text-danger">Failed to load artifacts</td></tr>';
  }
}

function renderArtifacts() {
  const tbody = getArtifactsTableBody();
  if (!tbody) return;
  const list = searchTerm
    ? artifacts.filter((a) => (a.name || '').toLowerCase().includes(searchTerm))
    : artifacts;
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading">${artifacts.length === 0 ? 'No artifacts found. Import or add some.' : 'No matches for search.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map((a) => {
      const safeClass = CLASS_WHITELIST.includes(a.class) ? a.class : 'unknown';
      const classDisplay = escapeAttr(CLASS_NAMES[safeClass] || 'Unknown');
      const parsedStar = parseInt(a.star_rating, 10);
      const sanitizedRating = Math.max(
        0,
        Math.min(5, Number.isFinite(parsedStar) ? parsedStar : 0),
      );
      const stars = Array(sanitizedRating)
        .fill(0)
        .map(
          () =>
            `<img src="${ICONS_BASE}/star${sanitizedRating}.png" alt="${escapeAttr(String(sanitizedRating))} stars">`,
        )
        .join('');
      return `<tr><td>${escapeHtml(a.name)}</td><td class="icon-cell"><img src="${ICONS_BASE}/${encodeURIComponent(safeClass)}.png" alt="${classDisplay}" title="${classDisplay}"></td><td class="stars-cell">${stars}</td><td class="row-actions"><button class="btn btn-sm btn-danger" data-del-artifact-id="${escapeAttr(a.id)}" data-del-artifact-name="${escapeAttr(a.name)}">Delete</button></td></tr>`;
    })
    .join('');
  tbody
    .querySelectorAll('[data-del-artifact-id]')
    .forEach((btn) =>
      btn.addEventListener('click', () =>
        deleteArtifact(
          parseInt(btn.dataset.delArtifactId),
          btn.dataset.delArtifactName,
        ),
      ),
    );
}

async function handleAddArtifact(e) {
  e.preventDefault();
  const name = document.getElementById('artifact-name').value.trim();
  const artifactClass = document.getElementById('artifact-class').value;
  const stars = parseInt(document.getElementById('artifact-stars').value);
  try {
    const r = await fetch(`${API_URL}?action=admin_add_base_artifact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ name, class: artifactClass, star_rating: stars }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error: ${r.status} ${r.statusText}${text ? `: ${text}` : ''}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    document.getElementById('artifact-modal').classList.remove('active');
    await loadArtifacts();
  } catch (err) {
    alert(`Failed to add artifact: ${err.message}`);
  }
}

async function deleteArtifact(artifactId, artifactName) {
  if (
    !confirm(
      `Delete artifact "${artifactName}"? This will also remove it from all user accounts.`,
    )
  )
    return;
  try {
    const r = await fetch(`${API_URL}?action=admin_delete_base_artifact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ artifact_id: artifactId }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error ${r.status} ${r.statusText}: ${text}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    await loadArtifacts();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}
