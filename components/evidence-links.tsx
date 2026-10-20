export function EvidenceLinks({ urls }: { urls: readonly string[] }) {
  return <span className="research-sources">{urls.map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Source {i + 1}</a>)}</span>;
}
