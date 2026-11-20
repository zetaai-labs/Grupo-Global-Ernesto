import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import './CloudFolders.css'
import { useT } from '../../../../../i18n'

function formatSize(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function CloudFolders() {
  const t = useT()
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [folderResponse, fileResponse] = await Promise.all([
        api.get('/folders'),
        api.get('/files'),
      ])
      const folderList = folderResponse.data?.data || []
      setFolders(folderList)
      setFiles(fileResponse.data?.data || [])
      if (!selectedFolder && folderList.length) setSelectedFolder(String(folderList[0].id))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load folders.')
    } finally {
      setLoading(false)
    }
  }, [selectedFolder])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createFolder = async (event) => {
    event.preventDefault()
    if (!newFolder.trim()) return
    setNotice('')
    try {
      await api.post('/folders', { name: newFolder.trim() })
      setNewFolder('')
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the folder.')
    }
  }

  const uploadFile = async (event) => {
    event.preventDefault()
    if (!selectedFile || !selectedFolder) {
      setNotice('Choose a file and a destination folder first.')
      return
    }
    setNotice('')
    const form = new FormData()
    form.append('file', selectedFile)
    form.append('folder_id', selectedFolder)

    try {
      await api.post('/files', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSelectedFile(null)
      event.target.reset()
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Upload failed.')
    }
  }

  const download = async (file) => {
    try {
      const response = await api.get(`/files/${file.id}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setNotice('Could not download this file.')
    }
  }

  const removeFile = async (file) => {
    try {
      await api.delete(`/files/${file.id}`)
      await load()
    } catch {
      setNotice('Could not move this file to the recycle bin.')
    }
  }

  const visibleFiles = selectedFolder
    ? files.filter((file) => String(file.folder_id) === String(selectedFolder))
    : files

  return (
    <section className="feature-page cloud-folders-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('DOCUMENT MANAGEMENT')}</div>
          <h1>{t('Cloud Folders')}</h1>
          <p>{t('Access and organize corporate documents, folders and shared resources.')}</p>
        </div>
        <form className="cloud-inline-form" onSubmit={createFolder}>
          <input
            value={newFolder}
            onChange={(event) => setNewFolder(event.target.value)}
            placeholder="New folder name"
            aria-label="New folder name"
          />
          <button className="primary-action" type="submit">＋ New folder</button>
        </form>
      </div>

      <div className="feature-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Total folders</span><span className="stat-icon">▤</span></div>
          <strong>{folders.length}</strong>
          <small>Across your workspace</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Files</span><span className="stat-icon">▧</span></div>
          <strong>{files.length}</strong>
          <small>Available documents</small>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Shared folders</span><span className="stat-icon">⇄</span></div>
          <strong>{folders.filter((folder) => folder.is_shared).length}</strong>
          <small>Collaborative access</small>
        </div>
      </div>

      {notice && <div className="cloud-notice">{notice}</div>}

      <div className="cloud-layout">
        <div className="feature-panel cloud-folder-panel">
          <div className="panel-heading">
            <div>
              <h3>Folders</h3>
              <p>Select a folder to see its documents.</p>
            </div>
          </div>
          {folders.length > 0 ? (
            <div className="feature-list">
              {folders.map((folder) => (
                <button
                  type="button"
                  key={folder.id}
                  className={`cloud-folder-row ${String(folder.id) === String(selectedFolder) ? 'selected' : ''}`}
                  onClick={() => setSelectedFolder(String(folder.id))}
                >
                  <span className="list-item-icon">▤</span>
                  <span className="list-item-copy">
                    <strong>{folder.name}</strong>
                    <span>{folder.file_count} files{folder.is_shared ? ' · shared' : ''}</span>
                  </span>
                  <span className="list-item-arrow">↗</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="feature-empty-state">
              <div className="empty-icon">▤</div>
              <h3>No folders yet</h3>
              <p>Create your first folder to start storing documents.</p>
            </div>
          )}
        </div>

        <div className="feature-panel cloud-file-panel">
          <div className="panel-heading">
            <div>
              <h3>Documents</h3>
              <p>Upload, download and manage files in the selected folder.</p>
            </div>
          </div>

          <form className="cloud-upload-form" onSubmit={uploadFile}>
            <select
              value={selectedFolder}
              onChange={(event) => setSelectedFolder(event.target.value)}
              aria-label="Destination folder"
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <input
              type="file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              aria-label="File to upload"
            />
            <button type="submit" className="secondary-action">Upload file</button>
          </form>

          {loading ? (
            <p className="cloud-empty">Loading documents…</p>
          ) : visibleFiles.length ? (
            <div className="feature-list">
              {visibleFiles.map((file) => (
                <div className="cloud-file-row" key={file.id}>
                  <span className="list-item-icon">▧</span>
                  <span className="list-item-copy">
                    <strong>{file.name}</strong>
                    <span>{formatSize(file.size_bytes)} · {file.mime_type}</span>
                  </span>
                  <button type="button" onClick={() => download(file)}>Download</button>
                  <button type="button" className="cloud-remove" onClick={() => removeFile(file)}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="feature-empty-state">
              <div className="empty-icon">▧</div>
              <h3>No files in this folder</h3>
              <p>Upload a document using the control above.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default CloudFolders
