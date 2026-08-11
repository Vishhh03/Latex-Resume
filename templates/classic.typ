#let data = json("/resumes/resume.json")

#set page(
  paper: "a4",
  margin: (top: 1.3cm, bottom: 1.3cm, left: 1.6cm, right: 1.6cm),
)

#set text(
  font: "Times New Roman",
  size: 9.5pt,
  fill: rgb("#0f172a"),
)

#let primary-color = rgb("#047857")
#let dark-gray = rgb("#334155")

// Header Section
#align(center)[
  #text(size: 21pt, weight: "bold", fill: primary-color)[#data.basics.name] \
  #v(2pt)
  #text(size: 11pt, weight: "bold", fill: dark-gray)[#data.basics.title] \
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
  #line(length: 100%, stroke: 1pt + primary-color)
  #v(2pt)
]

// Work Experience
#if "work" in data and data.work.len() > 0 [
  #section-heading("Work Experience")
  #for job in data.work [
    #grid(
      columns: (1fr, auto),
      [
        #text(weight: "bold")[#job.position] \
        #text(style: "italic", fill: dark-gray)[#job.company]
      ],
      [
        #text(weight: "bold")[#job.startDate -- #job.endDate] \
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
        #text(weight: "bold")[#edu.startDate -- #edu.endDate] \
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
