import { useEffect, useRef } from 'react'

/** 瓦片走日事自己的 /api/days/geo，登录态用同源 cookie。不把坐标写进页面地址。 */
export default function LocationMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const node = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const holder: { map: { remove: () => void } | null; gone: boolean } = { map: null, gone: false }
    void (async () => {
      const leaflet = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (holder.gone || !node.current) return
      const map = leaflet.map(node.current).setView([latitude, longitude], 15)
      leaflet.tileLayer('/api/days/geo/tile/{z}/{x}/{y}', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
      leaflet.circleMarker([latitude, longitude], {
        radius: 9,
        color: '#e11d48',
        fillColor: '#fb7185',
        fillOpacity: 0.9,
      }).addTo(map)
      holder.map = map
    })()
    return () => {
      holder.gone = true
      holder.map?.remove()
    }
  }, [latitude, longitude])

  return <div ref={node} style={{ height: 240, width: '100%', borderRadius: 12 }} />
}
