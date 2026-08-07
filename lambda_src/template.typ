#let data = json("resume.json")

#set page(
  paper: "a4",
  margin: (top: 1.3cm, bottom: 1.3cm, left: 1.6cm, right: 1.6cm),
)

#set text(
  font: "Arial",
  size: 9.5pt,
  fill: rgb("#111827"),
)

#let primary-color = rgb("#0055aa")
#let dark-gray = rgb("#4b5563")

// Header Section
#align(center)[
  #text(size: 20pt, weight: "bold", fill: rgb("#0f172a"))[#data.basics.name] \
  #v(2pt)
  #text(size: 11pt, weight: "medium", fill: primary-color)[#data.basics.title] \
  #v(4pt)
  #text(size: 9pt, fill: dark-gray)[
    #data.basics.location #h(4pt) | #h(4pt)
    #data.basics.phone #h(4pt) | #h(4pt)
    #link("mailto:" + data.basics.email)[#data.basics.email]
    #if "website" in data.basics and data.basics.website != "" [ #h(4pt) | #h(4pt) #link(data.basics.website)[Website] ]
    #if "github" in data.basics and data.basics.github != "" [
      #h(4pt) | #h(4pt)
      #let gh = data.basics.github
      #let gh-url = if gh.starts-with("http") { gh } else { "https://github.com/" + gh }
      #link(gh-url)[GitHub]
    ]
    #if "linkedin" in data.basics and data.basics.linkedin != "" [
      #h(4pt) | #h(4pt)
      #let li = data.basics.linkedin
      #let li-url = if li.starts-with("http") { li } else { "https://linkedin.com/in/" + li }
      #link(li-url)[LinkedIn]
    ]
  ]
  #if "summary" in data.basics and data.basics.summary != "" [
    #v(3pt)
    #text(size: 8.5pt, style: "italic", fill: dark-gray)[#data.basics.summary]
  ]
]

#v(4pt)

// Section Heading Helper
#let section-heading(title) = [
  #v(6pt)
  #text(size: 11pt, weight: "bold", fill: primary-color)[#upper(title)]
  #v(-4pt)
  #line(length: 100%, stroke: 0.7pt + primary-color)
  #v(2pt)
]

// Work Experience
#if "work" in data and data.work.len() > 0 [
  #section-heading("Experience")
  #for job in data.work [
    #grid(
      columns: (1fr, auto),
      [
        #text(weight: "bold")[#job.position] \
        #text(style: "italic", fill: dark-gray)[#job.company]
      ],
      [
        #text(weight: "medium")[#job.startDate -- #job.endDate] \
        #align(right)[#text(style: "italic", fill: dark-gray, size: 8.5pt)[#job.location]]
      ]
    )
    #v(2pt)
    #for item in job.highlights [
      #list(marker: [•])[#item]
    ]
    #v(4pt)
  ]
]

// Projects
#if "projects" in data and data.projects.len() > 0 [
  #section-heading("Projects")
  #for proj in data.projects [
    #grid(
      columns: (1fr, auto),
      [
        #text(weight: "bold")[#proj.name]
        #if "subtitle" in proj and proj.subtitle != "" [ -- #text(style: "italic")[#proj.subtitle] ]
      ],
      [
        #let links = ()
        #if "website" in proj and proj.website != "" [ #links.push(link(proj.website)[Website]) ]
        #if "github" in proj and proj.github != "" [ #links.push(link(proj.github)[GitHub]) ]
        #links.join([ #h(4pt) | #h(4pt) ])
      ]
    )
    #v(2pt)
    #for item in proj.highlights [
      #list(marker: [•])[#item]
    ]
    #v(4pt)
  ]
]

// Education
#if "education" in data and data.education.len() > 0 [
  #section-heading("Education")
  #for edu in data.education [
    #grid(
      columns: (1fr, auto),
      [
        #text(weight: "bold")[#edu.studyType -- #edu.area] \
        #text(style: "italic", fill: dark-gray)[#edu.institution]
      ],
      [
        #text(weight: "medium")[#edu.startDate -- #edu.endDate] \
        #align(right)[#text(style: "italic", fill: dark-gray, size: 8.5pt)[#edu.location]]
      ]
    )
    #v(2pt)
    #for item in edu.highlights [
      #list(marker: [•])[#item]
    ]
    #v(4pt)
  ]
]

// Technical Skills
#if "skills" in data and data.skills.len() > 0 [
  #section-heading("Technical Skills")
  #for cat in data.skills [
    #text(weight: "bold")[#cat.name:] #h(4pt) #cat.keywords.join(", ") \
  ]
]

// Certifications
#if "certifications" in data and data.certifications.len() > 0 [
  #section-heading("Certifications")
  #for cert in data.certifications [
    #list(marker: [•])[#cert]
  ]
]

// Open Source
#if "openSource" in data and data.openSource.len() > 0 [
  #section-heading("Open Source Contributions")
  #for contrib in data.openSource [
    #list(marker: [•])[#contrib]
  ]
]
