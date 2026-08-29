// ---------------------------------------------------------------------
// BUILDING DATA — OMNI-MAPPED
// ---------------------------------------------------------------------

export const buildingData = {
  'faculty-biosci': {
    name: 'Faculty of Biosciences',
    category: 'Academic',
    description: 'Main faculty building for Biosciences.',
    nodeNames: ['Building_curve_190','Building_curve_190_1'],
  },
  'research-lab-pae': {
    name: 'Research Laboratory PAE',
    category: 'Laboratory',
    description: 'Research laboratory facility within the Science Village.',
    nodeNames: ['Mesh119_1','Mesh119'],
  },
  'dept-applied-biochem': {
    name: 'Department of Applied Biochemistry',
    category: 'Academic',
    description: 'Academic department building for Applied Biochemistry.',
    nodeNames: ['Mesh155_1','Mesh155'],
  },
  'dept-botany': {
    name: 'Department of Botany',
    category: 'Academic',
    description: 'Academic department building for Botany.',
    nodeNames: ['Mesh135','Mesh135_1'],
  },
  'biosci-shops': {
    name: 'Bioscience Shops',
    category: 'Services',
    description: 'Shop units serving the Bioscience cluster of the Science Village.',
    nodeNames: ['Cube001_1','Cube001'],
  },
  'joint-faculty-building': {
    name: 'Joint Faculty Building',
    category: 'Academic',
    description: 'Shared building serving multiple faculties.',
    nodeNames: ['Mesh203_1','Mesh203'],
  },
  'physics-lab': {
    name: 'Physics Lab',
    category: 'Laboratory',
    description: 'Laboratory facility for the Physics department.',
    nodeNames: ['Mesh164_1','Mesh164'],
  },
  'biology-lab': {
    name: 'Biology Lab',
    category: 'Laboratory',
    description: 'Laboratory facility for the Biology department.',
    nodeNames: ['Mesh168_1','Mesh168'],
  },
  'chemistry-lab': {
    name: 'Chemistry Lab',
    category: 'Laboratory',
    description: 'Laboratory facility for the Chemistry department.',
    nodeNames: ['Mesh179_1','Mesh179'],
  },
  'old-physci-building': {
    name: 'Old Physical Science Building',
    category: 'Academic',
    description: 'Original Physical Sciences departmental building.',
    nodeNames: ['Mesh142_1','Mesh142'],
  },
  'old-physci-shops': {
    name: 'Old Physical Science Shops',
    category: 'Services',
    description: 'Shop units near the Old Physical Sciences Building.',
    nodeNames: ['Mesh003_1','Mesh003'],
  },
  'science-village-toilet': {
    name: 'Science Village Toilet',
    category: 'Services',
    description: 'Restroom facility serving the Science Village.',
    nodeNames: ['Mesh124_1','Mesh124'],
  },
  'maths-dept': {
    name: 'Maths Department',
    category: 'Academic',
    description: 'Academic department building for Mathematics.',
    nodeNames: ['Cylinder'], 
  },
  'jupeb-hall-shops': {
    name: 'Jupeb Hall Shops',
    category: 'Services',
    description: 'Shop units located near Jupeb Hall in the Science Village.',
    nodeNames: ['Cube','Cube_1'],
  },
  'jupeb-hall': {
    name: 'Jupeb Hall',
    category: 'Academic',
    description: 'Hall used for the JUPEB program.',
    nodeNames: ['Mesh183_1','Mesh183'],
  },
  'new-physci-dept': {
    name: 'New Physical Science Department',
    category: 'Academic',
    description: 'Newer Physical Sciences departmental building.',
    nodeNames: ['Mesh167_1','Mesh167'],
  },
  'new-bioscience': {
    name: 'New Bioscience Building',
    category: 'Academic',
    description: 'Newer academic building for Bioscience.',
    nodeNames: ['Mesh156_1','Mesh156'],
  },
  'mictu-building': {
    name: 'MICTU Building',
    category: 'Administration',
    description: 'Management Information & Communication Technology Unit building.',
    nodeNames: ['Mesh143_1','Mesh143'],
  },
  'gen-house': {
    name: 'Gen House',
    category: 'Administration',
    description: 'General administration building within the Science Village.',
    nodeNames: ['Mesh136_1','Mesh136'],
  },
  'engineering': {
    name: 'Engineering Building',
    category: 'Academic',
    description: 'Engineering departmental building.',
    nodeNames: ['Mesh166_1','Mesh166'],
  },
  'engineering-workshop': {
    name: 'Engineering Workshop',
    category: 'Laboratory',
    description: 'Workshop facility for the Faculty of Engineering.',
    nodeNames:['Mesh230_1','Mesh230'],
  },
  'labs-eng': {
    name: 'Laboratories Faculty of Engineering',
    category: 'Laboratory',
    description: 'Laboratory facilities for the Faculty of Engineering.',
    nodeNames: ['Mesh151_1','Mesh151'],
  },
  'lecture-hall-eng': {
    name: 'Lecture Hall Faculty of Engineering',
    category: 'Academic',
    description: 'Lecture hall serving the Faculty of Engineering.',
    nodeNames: ['Mesh149_1','Mesh149'],
  },
  'engineering-block': {
    name: 'Engineering Building Block',
    category: 'Academic',
    description: 'An academic building block within the Engineering cluster.',
    nodeNames: ['Mesh108_1','Mesh108'],
  },
  'mech-industrial-production': {
    name: 'Mechanical and Industrial Production',
    category: 'Laboratory',
    description: 'Facility for Mechanical & Industrial Production.',
    nodeNames: ['Cube003_1','Cube003'],
  },
  'chisco-building': {
    name: 'Chisco Building',
    category: 'Services',
    description: 'Chisco building within the Science Village.',
    nodeNames: ['Plane006','Plane006_1'],
  },
  'restaurant': {
    name: 'Restaurant',
    category: 'Services',
    description: 'Restaurant serving the Science Village.',
    nodeNames: ['Cube005_1','Cube005'],
  },
  'automotive-workshop': {
    name: 'Automotive Workshop',
    category: 'Laboratory',
    description: 'Workshop facility for automotive engineering.',
    nodeNames: ['Building Curve 101', 'Building_curve_101', 'building_curve_.101'], 
  },
};

// ---------------------------------------------------------------------
// REVERSE LOOKUP (Do not change this section)
// ---------------------------------------------------------------------
export const nodeNameToBuildingId = Object.entries(buildingData).reduce(
  (lookup, [id, building]) => {
    building.nodeNames.forEach((nodeName) => {
      // Maps every single variation directly to the building ID
      lookup[nodeName] = id;
    });
    return lookup;
  },
  {}
);

// ---------------------------------------------------------------------
// CATEGORY COLORS
// ---------------------------------------------------------------------
export const categoryColors = {
  Academic: '#7FA6B8',
  Laboratory: '#C98A4B',
  Administration: '#8B90A6',
  Services: '#B8724F',
  Residential: '#9B8BAE',
};