use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use sha2::Digest;
use tokio::io::AsyncWriteExt;

use crate::error::{AppError, AppResult};

fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

/// Descarga un archivo verificando opcionalmente su sha256.
///
/// `on_progress(descargado, total)` se invoca durante la descarga.
pub async fn download_file<F>(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_sha256: Option<&str>,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, Option<u64>),
{
    if let Some(parent) = dest.parent() {
        crate::paths::ensure_dir(parent)?;
    }

    let tmp = part_path(dest);
    let resp = client
        .get(url)
        .header("Accept-Encoding", "identity")
        .send()
        .await?
        .error_for_status()?;

    let total = resp.content_length();
    let mut file = tokio::fs::File::create(&tmp).await?;
    let mut hasher = sha2::Sha256::new();
    let mut downloaded: u64 = 0;

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total);
    }
    file.flush().await?;
    drop(file);

    if let Some(expected) = expected_sha256 {
        if !expected.is_empty() {
            let actual = hex::encode(hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = tokio::fs::remove_file(&tmp).await;
                return Err(AppError::Message(format!(
                    "Checksum inválido: esperado {expected}, obtenido {actual}"
                )));
            }
        }
    }

    if dest.exists() {
        let _ = tokio::fs::remove_file(dest).await;
    }
    tokio::fs::rename(&tmp, dest).await?;
    Ok(())
}

/// Descarga a un archivo temporal y devuelve la ruta resultante.
pub async fn download_to_temp<F>(
    client: &reqwest::Client,
    url: &str,
    filename: &str,
    on_progress: F,
) -> AppResult<PathBuf>
where
    F: FnMut(u64, Option<u64>),
{
    let dir = crate::paths::cache_dir().join("tmp");
    crate::paths::ensure_dir(&dir)?;
    let dest = dir.join(filename);
    download_file(client, url, &dest, None, on_progress).await?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn part_path_appends_suffix() {
        let p = part_path(Path::new("C:/x/server.jar"));
        assert!(p.to_string_lossy().ends_with("server.jar.part"));
    }
}
