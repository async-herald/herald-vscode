# Animation de Chargement Herald - Documentation Technique

Ce document explique comment reproduire l'animation de chargement avec les différents Heralds lors de l'analyse dans l'extension VS Code Herald.

---

## Vue d'ensemble

L'animation de chargement fonctionne ainsi :
1. **7 Heralds différents** s'affichent en rotation pendant l'analyse
2. Chaque Herald représente une catégorie d'analyse spécifique
3. Les Heralds changent **toutes les 3 secondes**
4. Une **barre de progression** accompagne l'animation
5. Le temps minimum d'affichage est de **21 secondes** (7 × 3s)

---

## Les 7 Heralds et leurs rôles

| Index | Nom | Couleur | Catégorie analysée |
|-------|-----|---------|-------------------|
| 0 | **Seraph** | `#A78BFA` (violet clair) | Analyse générale |
| 1 | **Uriel** | `#EF4444` (rouge) | Failles de sécurité |
| 2 | **Auriel** | `#8B5CF6` (violet) | Structure du code |
| 3 | **Barachiel** | `#10B981` (vert) | Performance |
| 4 | **Zadkiel** | `#3B82F6` (bleu) | Qualité du code |
| 5 | **Raziel** | `#06B6D4` (cyan) | Documentation & Tests |
| 6 | **Cassiel** | `#F59E0B` (orange) | Patterns IA toxiques |

---

## Structure des données

```typescript
interface HeraldStep {
  name: string;        // Nom du Herald (ex: "Seraph")
  label: string;       // Catégorie courte (ex: "Analyse générale")
  description: string; // Description de l'action
  color: string;       // Couleur hex
}

const HERALD_ANALYSIS_STEPS: HeraldStep[] = [
  {
    name: 'Seraph',
    label: 'Analyse générale',
    description: 'évalue la qualité globale du repository',
    color: '#A78BFA'
  },
  {
    name: 'Uriel',
    label: 'Failles de sécurité',
    description: 'traque les injections SQL, XSS, secrets exposés et vulnérabilités',
    color: '#EF4444'
  },
  {
    name: 'Auriel',
    label: 'Structure du code',
    description: 'examine l\'architecture et l\'organisation des fichiers',
    color: '#8B5CF6'
  },
  {
    name: 'Barachiel',
    label: 'Performance',
    description: 'détecte les memory leaks, boucles infinies et goulots d\'étranglement',
    color: '#10B981'
  },
  {
    name: 'Zadkiel',
    label: 'Qualité',
    description: 'inspecte l\'historique Git et la qualité globale du code',
    color: '#3B82F6'
  },
  {
    name: 'Raziel',
    label: 'Documentation & Tests',
    description: 'vérifie la documentation et la couverture des tests',
    color: '#06B6D4'
  },
  {
    name: 'Cassiel',
    label: 'Patterns IA toxiques',
    description: 'identifie le code généré non optimisé et le vibecoding',
    color: '#F59E0B'
  },
];
```

---

## Logique de rotation des Heralds

### État

```typescript
const [currentHeraldIndex, setCurrentHeraldIndex] = useState(0);
const [elapsedTime, setElapsedTime] = useState(0);
const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
```

### Intervalle de changement (toutes les 3 secondes)

```typescript
// Démarrer quand l'analyse commence
useEffect(() => {
  if (isAnalyzing) {
    // Cycle à travers les différents Heralds pendant l'analyse
    const heraldCycleInterval = setInterval(() => {
      setCurrentHeraldIndex(prev => (prev + 1) % 7); // 7 Heralds au total
    }, 3000); // Change toutes les 3 secondes

    return () => {
      clearInterval(heraldCycleInterval);
    };
  }
}, [isAnalyzing]);
```

### Timer pour afficher le temps écoulé

```typescript
useEffect(() => {
  if (!analysisStartTime || isComplete) {
    return;
  }

  const timerInterval = setInterval(() => {
    const elapsed = Date.now() - analysisStartTime;
    setElapsedTime(elapsed);
  }, 100); // Met à jour toutes les 100ms pour fluidité

  return () => {
    clearInterval(timerInterval);
  };
}, [analysisStartTime, isComplete]);
```

---

## Temps minimum d'animation

Pour une meilleure UX, l'animation dure au minimum 21 secondes (le temps de voir tous les Heralds) :

```typescript
const startAnalysis = async () => {
  const MIN_ANIMATION_TIME = 7 * 3000; // 21 secondes
  const startTime = Date.now();
  setAnalysisStartTime(startTime);

  try {
    // Appel API réel
    const result = await analyzeRepository(repoUrl, userToken);

    // Calculer le temps restant pour atteindre le minimum
    const elapsedTime = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime);

    // Attendre le temps minimum avant d'afficher le résultat
    setTimeout(() => {
      setIsComplete(true);
    }, remainingTime);

  } catch (error) {
    // En cas d'erreur, afficher immédiatement (pas d'attente)
    setAnalysisError(error.message);
  }
};
```

---

## Affichage du texte dynamique

Le texte change en fonction du Herald actuel :

```tsx
<span style={{ color: HERALD_ANALYSIS_STEPS[currentHeraldIndex].color }}>
  {HERALD_ANALYSIS_STEPS[currentHeraldIndex].name}
</span>
{' '}
{HERALD_ANALYSIS_STEPS[currentHeraldIndex].description}
```

**Exemple de rendu :**
- <span style="color: #EF4444">**Uriel**</span> traque les injections SQL, XSS, secrets exposés et vulnérabilités

---

## Barre de progression

La barre de progression se base sur le temps écoulé (21 secondes = 100%) :

```tsx
<div
  className="progress-bar-fill"
  style={{
    width: `${Math.min(100, (elapsedTime / 21000) * 100)}%`,
    backgroundColor: HERALD_ANALYSIS_STEPS[currentHeraldIndex].color,
  }}
/>
```

---

## Implémentation CSS pour VS Code (Webview)

### Structure HTML

```html
<div class="loading-container">
  <!-- Icône Herald animée -->
  <div class="herald-icon" id="herald-icon">
    <!-- SVG du Herald actuel -->
  </div>

  <!-- Texte dynamique -->
  <p class="loading-text">
    <span class="herald-name" id="herald-name">Seraph</span>
    <span id="herald-description">évalue la qualité globale du repository</span>
  </p>

  <!-- URL du repo -->
  <p class="repo-url">{repoUrl}</p>

  <!-- Barre de progression -->
  <div class="progress-bar">
    <div class="progress-bar-fill" id="progress-fill"></div>
  </div>

  <!-- Timer -->
  <div class="timer">
    <span id="elapsed-time">0.0s</span>
  </div>
</div>
```

### CSS

```css
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.herald-icon {
  width: 140px;
  height: 140px;
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.loading-text {
  font-size: 16px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.herald-name {
  font-weight: 700;
  transition: color 0.3s ease;
}

.repo-url {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  max-width: 300px;
  height: 6px;
  background: rgba(71, 85, 105, 0.4);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.1s linear, background-color 0.3s ease;
}

.timer {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 500;
}
```

### JavaScript (dans la Webview)

```javascript
const HERALD_STEPS = [
  { name: 'Seraph', description: 'évalue la qualité globale du repository', color: '#A78BFA' },
  { name: 'Uriel', description: 'traque les injections SQL, XSS, secrets exposés et vulnérabilités', color: '#EF4444' },
  { name: 'Auriel', description: 'examine l\'architecture et l\'organisation des fichiers', color: '#8B5CF6' },
  { name: 'Barachiel', description: 'détecte les memory leaks, boucles infinies et goulots d\'étranglement', color: '#10B981' },
  { name: 'Zadkiel', description: 'inspecte l\'historique Git et la qualité globale du code', color: '#3B82F6' },
  { name: 'Raziel', description: 'vérifie la documentation et la couverture des tests', color: '#06B6D4' },
  { name: 'Cassiel', description: 'identifie le code généré non optimisé et le vibecoding', color: '#F59E0B' },
];

let currentHeraldIndex = 0;
let startTime = Date.now();
let heraldInterval;
let timerInterval;

function startLoadingAnimation() {
  startTime = Date.now();
  currentHeraldIndex = 0;

  updateHeraldDisplay();

  // Changer de Herald toutes les 3 secondes
  heraldInterval = setInterval(() => {
    currentHeraldIndex = (currentHeraldIndex + 1) % 7;
    updateHeraldDisplay();
  }, 3000);

  // Mettre à jour le timer toutes les 100ms
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    updateProgress(elapsed);
  }, 100);
}

function updateHeraldDisplay() {
  const step = HERALD_STEPS[currentHeraldIndex];

  document.getElementById('herald-name').textContent = step.name;
  document.getElementById('herald-name').style.color = step.color;
  document.getElementById('herald-description').textContent = step.description;
  document.getElementById('progress-fill').style.backgroundColor = step.color;

  // Mettre à jour l'icône Herald (SVG)
  updateHeraldIcon(currentHeraldIndex);
}

function updateProgress(elapsedMs) {
  const progressPercent = Math.min(100, (elapsedMs / 21000) * 100);
  document.getElementById('progress-fill').style.width = `${progressPercent}%`;
  document.getElementById('elapsed-time').textContent = `${(elapsedMs / 1000).toFixed(1)}s`;
}

function stopLoadingAnimation() {
  clearInterval(heraldInterval);
  clearInterval(timerInterval);
}

function updateHeraldIcon(index) {
  const iconContainer = document.getElementById('herald-icon');
  // Remplacer le contenu SVG par le Herald correspondant
  iconContainer.innerHTML = getHeraldSVG(index);
}

function getHeraldSVG(index) {
  // Retourner le SVG correspondant à l'index
  // Voir la section "SVG des Heralds" ci-dessous
}
```

---

## SVG simplifiés pour les Heralds

Voici des versions simplifiées des SVG pour chaque Herald (adapté pour une webview) :

```javascript
function getHeraldSVG(index) {
  const colors = {
    0: { primary: '#A78BFA', secondary: '#DDD6FE' }, // Seraph
    1: { primary: '#EF4444', secondary: '#FCA5A5' }, // Uriel
    2: { primary: '#8B5CF6', secondary: '#C4B5FD' }, // Auriel
    3: { primary: '#10B981', secondary: '#6EE7B7' }, // Barachiel
    4: { primary: '#3B82F6', secondary: '#93C5FD' }, // Zadkiel
    5: { primary: '#06B6D4', secondary: '#67E8F9' }, // Raziel
    6: { primary: '#F59E0B', secondary: '#FCD34D' }, // Cassiel
  };

  const { primary, secondary } = colors[index];

  return `
    <svg viewBox="0 0 100 100" width="140" height="140">
      <!-- Halo -->
      <circle cx="50" cy="50" r="45" fill="none" stroke="${secondary}" stroke-width="1" opacity="0.3"/>

      <!-- Ailes gauche -->
      <path d="M42 44 L28 30 L10 16 L12 26 L22 36 L18 34 L10 28 L16 40 L28 45 L40 46 Z"
            fill="${secondary}" stroke="${primary}" stroke-width="0.8"/>
      <path d="M42 56 L28 70 L10 84 L12 74 L22 64 L18 66 L10 72 L16 60 L28 55 L40 54 Z"
            fill="${secondary}" stroke="${primary}" stroke-width="0.8"/>

      <!-- Ailes droite -->
      <path d="M58 44 L72 30 L90 16 L88 26 L78 36 L82 34 L90 28 L84 40 L72 45 L60 46 Z"
            fill="${secondary}" stroke="${primary}" stroke-width="0.8"/>
      <path d="M58 56 L72 70 L90 84 L88 74 L78 64 L82 66 L90 72 L84 60 L72 55 L60 54 Z"
            fill="${secondary}" stroke="${primary}" stroke-width="0.8"/>

      <!-- Corps (œil) -->
      <circle cx="50" cy="50" r="14" fill="#FFF" stroke="${primary}" stroke-width="2"/>
      <circle cx="50" cy="50" r="9" fill="${primary}"/>
      <circle cx="50" cy="50" r="4" fill="#1E1B4B"/>
      <circle cx="53" cy="47" r="2" fill="#FFF"/>
    </svg>
  `;
}
```

---

## Animation CSS pour les ailes

Pour animer les ailes avec CSS :

```css
.herald-icon svg path:nth-child(2),
.herald-icon svg path:nth-child(3) {
  transform-origin: 42px 50px;
  animation: flapLeft 1.2s ease-in-out infinite;
}

.herald-icon svg path:nth-child(4),
.herald-icon svg path:nth-child(5) {
  transform-origin: 58px 50px;
  animation: flapRight 1.2s ease-in-out infinite;
}

@keyframes flapLeft {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-15deg); }
}

@keyframes flapRight {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(15deg); }
}
```

---

## Résumé

1. **Démarrer** `startLoadingAnimation()` au début de l'analyse
2. **Rotation** automatique des Heralds toutes les 3 secondes
3. **Couleur** et **texte** changent dynamiquement
4. **Barre de progression** basée sur 21 secondes total
5. **Arrêter** `stopLoadingAnimation()` quand l'analyse est terminée

Cette approche crée une expérience visuelle engageante qui montre à l'utilisateur que différents aspects du code sont analysés par différents "gardiens" spécialisés.
