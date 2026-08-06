export default function Logo() {
  return (
    <div className="flex flex-col items-center">
      <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Tumaa" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
    </div>
  )
}
