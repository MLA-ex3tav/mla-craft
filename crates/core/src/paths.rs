use std::path::PathBuf;

/// Directorio raíz de datos de la aplicación.
///
/// En Windows vive en `%APPDATA%\MLA Craft`.
pub fn data_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            if !appdata.is_empty() {
                return PathBuf::from(appdata).join("MLA Craft");
            }
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("MLA Craft");
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("MLA Craft")
}

/// Directorio de caché (JDKs, descargas temporales).
pub fn cache_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            if !local.is_empty() {
                return PathBuf::from(local).join("MLA Craft").join("cache");
            }
        }
    }

    data_dir().join("cache")
}

/// Asegura que un directorio exista.
pub fn ensure_dir(path: &std::path::Path) -> std::io::Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}
