export interface SiteConfig {
  language: string
  siteTitle: string
  siteDescription: string
}

export interface NavigationLink {
  label: string
  href: string
}

export interface NavigationConfig {
  brandName: string
  links: NavigationLink[]
}

export interface HeroConfig {
  eyebrow: string
  titleLines: string[]
  leadText: string
  supportingNotes: string[]
}

export interface ManifestoConfig {
  videoPath: string
  text: string
}

export interface FacilityArticle {
  title: string
  paragraphs: string[]
}

export interface FacilityItem {
  slug: string
  name: string
  code: string
  address: string
  status: string
  email: string
  phone: string
  ctaText: string
  ctaHref: string
  image: string
  utcOffset: number
  article: FacilityArticle
}

export interface FacilitiesConfig {
  sectionLabel: string
  detailBackText: string
  detailNotFoundText: string
  detailReturnText: string
  items: FacilityItem[]
}

export interface ObservationConfig {
  sectionLabel: string
  videoPath: string
  statusText: string
  latLabel: string
  lonLabel: string
  initialLat: number
  initialLon: number
}

export interface ArchiveItem {
  src: string
  label: string
}

export interface ArchivesConfig {
  sectionLabel: string
  vaultTitle: string
  closeText: string
  items: ArchiveItem[]
}

export interface FooterConfig {
  copyrightText: string
  statusText: string
}

export const siteConfig: SiteConfig = {
  language: "",
  siteTitle: "",
  siteDescription: "",
}

export const navigationConfig: NavigationConfig = {
  brandName: "",
  links: [],
}

export const heroConfig: HeroConfig = {
  eyebrow: "",
  titleLines: [],
  leadText: "",
  supportingNotes: [],
}

export const manifestoConfig: ManifestoConfig = {
  videoPath: "",
  text: "",
}

export const facilitiesConfig: FacilitiesConfig = {
  sectionLabel: "",
  detailBackText: "",
  detailNotFoundText: "",
  detailReturnText: "",
  items: [],
}

export const observationConfig: ObservationConfig = {
  sectionLabel: "",
  videoPath: "",
  statusText: "",
  latLabel: "",
  lonLabel: "",
  initialLat: 0,
  initialLon: 0,
}

export const archivesConfig: ArchivesConfig = {
  sectionLabel: "",
  vaultTitle: "",
  closeText: "",
  items: [],
}

export const footerConfig: FooterConfig = {
  copyrightText: "",
  statusText: "",
}
