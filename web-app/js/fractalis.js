// # sourceURL=fractalis.js

// eslint-disable-next-line no-unused-vars
window.addFractalisPanel = parentPanel => parentPanel.insert(4, fractalisPanel)

const fractalisPanel = new Ext.Panel({
  id: 'fractalisPanel',
  title: 'Fractalis',
  region: 'center',
  split: true,
  height: 90,
  layout: 'fit',
  collapsible: true,
  autoScroll: true,
  autoLoad: {
    url: window.pageInfo.basePath + '/fractalis/index',
    method: 'POST',
    scripts: false,
    callback: () => {
      const conceptBox = document.querySelector('.fjs-concept-box')
      if (fjsService.fjs == null) {
        fjsService.initFractalis().catch(error => {
          Ext.Msg.alert('Could not initialize Fractalis. Reason: ' + error)
        })
      }
      fjsService.activateDragAndDrop(conceptBox)
      fjsService.observeConceptBox(conceptBox)
    }
  },
  listeners: {
    deactivate: () => {
      fjsService.resetUrl()
    },
    activate: () => {
      fjsService.setUrl()
      fjsService.showLoadingScreen(true)
      fjsService.getPatientIDs()
        .then(ids => {
          const subset1 = ids.subjectIDs1.split(',')
          const subset2 = ids.subjectIDs2.split(',')
          fjsService.fjs.setSubsets([subset1, subset2])
        }, error => Ext.Msg.alert('Could not retrieve patient ids. Reason: ' + error))
        .then(() => fjsService.showLoadingScreen(false))
    }
  }
})

const fjsService = {
  fjs: null,
  token: null,

  async initFractalis () {
    const settings = await this.fetchAsync('settings')
    this.token = await this.fetchAsync('token')
    this.fjs = window.fractal.init({
      handler: 'pic-sure',
      dataSource: settings.dataSource,
      fractalisNode: settings.node,
      getAuth: () => {
        return this.token
      },
      options: {
        controlPanelPosition: 'right'
      }
    })
  },

  async fetchAsync (action) {
    return (await window.fetch(window.pageInfo.basePath + '/fractalis/' + action,
      {method: 'GET', redirect: 'follow', credentials: 'same-origin'})).json()
  },

  activateDragAndDrop (conceptBox) {
    const extObj = Ext.get(conceptBox)
    const dtgI = new Ext.dd.DropTarget(extObj, {ddGroup: 'makeQuery'})
    dtgI.notifyDrop = window.dropOntoCategorySelection
  },

  observeConceptBox (conceptBox) {
    const observer = new window.MutationObserver(targets => {
      targets.forEach(target => {
        Array.prototype.forEach.call(target.addedNodes, node => {
          const attr = this.getConceptAttributes(node)
          const descriptor = {query: this.buildPicSureQuery(attr.path, attr.dataType), dataType: attr.dataType}
          this.fjs.loadData([descriptor]).then(() => {
            node.innerHTML = '<span>Request has been submitted!</span>'
            node.style.background = '#82ff69'
            node.className = 'fjs-fade-out'
            window.setTimeout(() => node.remove(), 2000)
          })
        })
      })
    })
    observer.observe(conceptBox, {childList: true})
  },

  getConceptAttributes (node) {
    return {
      path: node.getAttribute('conceptid'),
      dataType: node.getAttribute('setnodetype') === 'valueicon' ? 'numerical' : 'categorical'
    }
  },

  buildPicSureQuery (path, type) {
    const alias = this.shortenConcept(path)
    path = path.replace(/\\+/g, '/')
    path = '/nhanes/Demo' + path // #FIXME This is a VERY ugly hardcoded hack that should not be in production
    return {
      'select': [
        {'field': {'pui': path}, 'alias': alias}
      ],
      'where': [
        {
          'field': {'pui': path, 'dataType': 'STRING'}, // FIXME: dataType should be attr.dataType but PIC-SURE only knows STRING
          'predicate': 'CONTAINS',
          'fields': {'ENOUNTER': 'YES'}
        }
      ]
    }
  },

  shortenConcept (concept) {
    let split = concept.split('\\')
    split = split.filter(s => s !== '')
    return split[split.length - 2] + '/' + split[split.length - 1]
  },

  chartStates: {},
  setUrl () {
    const url = window.pageInfo.basePath + '/fractalis/state/' + Object.values(this.chartStates).join('+')
    window.history.pushState(null, '', url)
  },

  resetUrl () {
    const url = window.pageInfo.basePath + '/datasetExplorer'
    window.history.pushState(null, '', url)
  },

  handleStateIDs (stateIDs) {
    Ext.Msg.alert('The url you specified contains a Fractalis state.\n' +
      'We will attempt to recover the associated charts and inform you once this has been done.')
    Promise.all(stateIDs.map(stateID => {
      const chartID = this.addChartContainer()
      return this.fjs.id2chart('#' + chartID, stateID)
    })).then(() => {
      Ext.Msg.alert('All charts have been successfully recovered. Please proceed to the Fractalis tab.')
    }).catch(e => {
      Ext.Msg.alert('Could not recover one or more charts from URL.\n' +
        'Contact your administrator if this issue persists. Error: ' + e.toString())
    })
    this.setUrl()
  },

  addChartContainer () {
    const chart = document.createElement('div')
    const container = document.querySelector('.fjs-placeholders')
    chart.id = 'fjs-chart-' + container.children.length
    container.appendChild(chart)
    return chart.id
  },

  setChart () {
    const chartID = this.addChartContainer()
    const vm = this.fjs.setChart(document.querySelector('.fjs-analysis-select').value, '#' + chartID)
    this.fjs.chart2id(vm, id => {
      this.chartStates[chartID] = id
      this.setUrl()
    })
  },

  clearCache () {
    this.fjs.clearCache()
    document.querySelector('.fjs-concept-box').innerHTML = ''
  },

  getPatientIDs () {
    const dfd = jQuery.Deferred()
    window.runAllQueries(() => {
      jQuery.ajax({
        url: window.pageInfo.basePath + '/fractalis/patients',
        type: 'POST',
        data: {
          result_instance_id1: window.GLOBAL.CurrentSubsetIDs[1],
          result_instance_id2: window.GLOBAL.CurrentSubsetIDs[2]
        }
      }).then(res => dfd.resolve(res))
    })
    return dfd.promise()
  },

  showLoadingScreen (bb) {
    const container = document.querySelector('.fjs-spinner')
    if (bb) {
      container.style.display = 'block'
    } else {
      container.style.display = 'none'
    }
  }
}
