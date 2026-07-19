# Guide d'installation - Async Herald Extension

## 🚀 Méthode 1 : Mode développement (Recommandé pour le test)

Cette méthode est la plus simple pour tester l'extension.

### Étapes

1. **Ouvrir le projet dans VSCode**
   ```bash
   cd herald-vscode
   code .
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Compiler le projet**
   ```bash
   npm run compile
   ```

4. **Lancer l'extension en mode debug**
   - Appuyez sur **F5** (ou allez dans `Run > Start Debugging`)
   - Une nouvelle fenêtre VSCode s'ouvrira avec l'extension chargée
   - Cette fenêtre s'appelle "Extension Development Host"

5. **Tester l'extension**
   - Dans la fenêtre de développement, ouvrez un projet
   - Cliquez sur l'icône Herald dans la sidebar
   - Ou utilisez la commande : `Cmd/Ctrl + Shift + P` → `Async Herald : Ouvrir le menu`

### Avantages
- Pas besoin de packager
- Rechargement automatique des modifications
- Accès au debugger VSCode

---

## 📦 Méthode 2 : Installation locale avec .vsix

Cette méthode installe l'extension de manière permanente dans votre VSCode.

### Prérequis

Installer `vsce` (VSCode Extension Manager) :
```bash
npm install -g @vscode/vsce
```

### Étapes

1. **Compiler le projet**
   ```bash
   npm run compile
   ```

2. **Créer le package .vsix**
   ```bash
   vsce package
   ```

   Cela crée un fichier `async-herald-0.0.12.vsix` (le numéro suit la version du `package.json`)

3. **Installer le .vsix dans VSCode**

   **Option A : Via la ligne de commande**
   ```bash
   code --install-extension async-herald-0.0.12.vsix
   ```

   **Option B : Via l'interface VSCode**
   1. Ouvrez VSCode
   2. Allez dans Extensions (`Cmd/Ctrl + Shift + X`)
   3. Cliquez sur les `...` en haut à droite
   4. Sélectionnez `Install from VSIX...`
   5. Choisissez le fichier `async-herald-0.0.12.vsix`

4. **Redémarrer VSCode**
   ```bash
   # Ou utilisez Cmd/Ctrl + Shift + P → "Reload Window"
   ```

### Désinstaller

Si vous voulez désinstaller l'extension :
1. Allez dans Extensions (`Cmd/Ctrl + Shift + X`)
2. Recherchez "Async Herald"
3. Cliquez sur l'icône d'engrenage → `Uninstall`

---

## 🔧 Méthode 3 : Mode watch (Pour le développement continu)

Si vous développez activement l'extension, utilisez le mode watch :

1. **Lancer la compilation en mode watch**
   ```bash
   npm run watch
   ```

2. **Dans une autre fenêtre, lancer l'extension (F5)**

3. **Recharger l'extension après chaque modification**
   - Dans la fenêtre "Extension Development Host"
   - Appuyez sur `Cmd/Ctrl + R` (Reload Window)
   - Ou `Cmd/Ctrl + Shift + P` → `Developer: Reload Window`

---

## ✅ Vérifier que l'extension est bien installée

### Dans la fenêtre de développement ou après installation

1. **Vérifier dans les extensions**
   - Ouvrez le panneau Extensions (`Cmd/Ctrl + Shift + X`)
   - Recherchez "Async Herald"
   - Vous devriez voir l'extension installée

2. **Vérifier les commandes**
   - `Cmd/Ctrl + Shift + P`
   - Tapez "Async Herald"
   - Vous devriez voir toutes les commandes disponibles :
     - Async Herald : Lier mon compte
     - Async Herald : Définir le token manuellement
     - Async Herald : Se déconnecter
     - Async Herald : Analyser le projet
     - Async Herald : Voir le rapport complet
     - Async Herald : Ouvrir le menu

3. **Vérifier le panneau**
   - Regardez dans la sidebar droite (Secondary Sidebar)
   - Vous devriez voir l'icône Herald
   - Cliquez dessus pour ouvrir le panneau

---

## 🐛 Dépannage

### L'extension ne se charge pas

```bash
# 1. Nettoyer et recompiler
rm -rf out/
npm run compile

# 2. Vérifier les logs
# Dans VSCode, ouvrez la console de développement :
# Help > Toggle Developer Tools > Console
```

### Erreur "Cannot find module"

```bash
# Réinstaller les dépendances
rm -rf node_modules package-lock.json
npm install
npm run compile
```

### L'icône Herald n'apparaît pas dans la sidebar

1. Vérifiez que le fichier `media/aile.svg` existe
2. Redémarrez VSCode
3. Essayez d'ouvrir le panneau via la commande : `Async Herald : Ouvrir le menu`

### Erreur lors du packaging avec vsce

```bash
# Si vous avez des erreurs de validation, ajoutez --allow-missing-repository
vsce package --allow-missing-repository

# Ou pour ignorer les warnings
vsce package --no-git-tag-version
```

---

## 📝 Notes

- Le mode développement (F5) est parfait pour tester rapidement
- Le .vsix est utile si vous voulez partager l'extension avec d'autres
- Pour publier sur le marketplace VSCode, vous aurez besoin d'un compte publisher officiel

## 🔗 Ressources

- [Documentation VSCode Extensions](https://code.visualstudio.com/api)
- [Guide de publication](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce Documentation](https://github.com/microsoft/vscode-vsce)
